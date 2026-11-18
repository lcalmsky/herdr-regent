import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actionQueue, buildSessions, chipGrid, chipMinWidth, decreeBlocker, decreePicks, decreeTargets, groupMap, groupRecord, newTabArgs, parseChoices,
  reportMinutes, sideWidth, queueSubtitle, ringSegments, rosterOf, rosterSlots, statusDetail, unitColumns, waitLabel,
} from "../data.js";
import { ORDER } from "../tokens.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("groupRecord sums per space", () => {
  const rows = [
    { session: { space: "studio", spaceName: "Studio" }, minutes: 12, working: 12, blocked: 0, done: 0 },
    { session: { space: "garden", spaceName: "Garden" }, minutes: 5, working: 0, blocked: 5, done: 0 },
    { session: { space: "studio", spaceName: "Studio" }, minutes: 3, working: 0, blocked: 0, done: 3 },
  ];
  assert.deepEqual(groupRecord(rows, "space"), [
    { key: "studio", label: "Studio", sample: rows[0].session, count: 2, minutes: 15, working: 12, blocked: 0, done: 3 },
    { key: "garden", label: "Garden", sample: rows[1].session, count: 1, minutes: 5, working: 0, blocked: 5, done: 0 },
  ]);
});

test("groupRecord sums per account and groups a missing one as Other", () => {
  const rows = [
    { session: { account: "work" }, minutes: 8, working: 0, blocked: 0, done: 8 },
    { session: { account: null }, minutes: 4, working: 4, blocked: 0, done: 0 },
    { session: { account: "home" }, minutes: 1, working: 0, blocked: 1, done: 0 },
    { session: {}, minutes: 2, working: 0, blocked: 0, done: 0 },
  ];
  assert.deepEqual(groupRecord(rows, "account").map((group) => [group.key, group.label, group.count, group.minutes]), [
    ["work", "work", 1, 8],
    ["", "Other", 2, 6],
    ["home", "home", 1, 1],
  ]);
});

test("groupRecord orders by minutes then label", () => {
  const rows = [
    { session: { space: "beta", spaceName: "Beta" }, minutes: 4, working: 0, blocked: 0, done: 0 },
    { session: { space: "alpha", spaceName: "Alpha" }, minutes: 4, working: 0, blocked: 0, done: 0 },
    { session: { space: "gamma", spaceName: "Gamma" }, minutes: 9, working: 0, blocked: 0, done: 0 },
  ];
  assert.deepEqual(groupRecord(rows, "space").map((group) => group.label), ["Gamma", "Alpha", "Beta"]);
});

test("groupRecord returns nothing for no rows", () => {
  assert.deepEqual(groupRecord([], "space"), []);
});

test("groupMap's status lens keeps one group per space, empty ones included", () => {
  const sessions = [
    { address: "a", space: "studio" },
    { address: "b", space: "garden" },
    { address: "c", space: "studio" },
  ];
  const spaces = [{ id: "studio", name: "Studio" }, { id: "empty", name: "Empty" }, { id: "garden", name: "Garden" }];
  const groups = groupMap(sessions, spaces, "status");
  assert.deepEqual(groups.map((group) => [group.key, group.name]), [
    ["studio", "Studio"],
    ["empty", "Empty"],
    ["garden", "Garden"],
  ]);
  assert.deepEqual(groups[0].sessions.map((session) => session.address), ["a", "c"]);
  assert.deepEqual(groups[1].sessions, []);
});

test("groupMap's repo lens groups by repo, names a missing one and skips empty groups", () => {
  const sessions = [
    { address: "a", space: "one", repo: "regent" },
    { address: "b", space: "one", repo: null },
    { address: "c", space: "two", repo: "hub" },
    { address: "d", space: "two", repo: "regent" },
  ];
  const groups = groupMap(sessions, [{ id: "one", name: "One" }, { id: "two", name: "Two" }], "repo");
  assert.deepEqual(groups.map((group) => [group.key, group.name]), [
    ["regent", "regent"],
    ["", "No repo"],
    ["hub", "hub"],
  ]);
  assert.deepEqual(groups[0].sessions.map((session) => session.address), ["a", "d"]);
});

test("groupMap's account lens groups by account and names a missing one Other", () => {
  const sessions = [
    { address: "a", space: "one", account: "work" },
    { address: "b", space: "one" },
    { address: "c", space: "two", account: "work" },
  ];
  const groups = groupMap(sessions, [], "account");
  assert.deepEqual(groups.map((group) => [group.key, group.name]), [["work", "work"], ["", "Other"]]);
  assert.deepEqual(groups[0].sessions.map((session) => session.address), ["a", "c"]);
});

test("groupMap treats an unknown or missing lens like the status lens", () => {
  const sessions = [{ address: "a", space: "studio" }];
  const spaces = [{ id: "studio", name: "Studio" }];
  const expected = [{ key: "studio", name: "Studio", sessions }];
  assert.deepEqual(groupMap(sessions, spaces, undefined), expected);
  assert.deepEqual(groupMap(sessions, spaces, "other"), expected);
});

test("parseChoices reads the colors question", () => {
  const parsed = parseChoices(fixture("ask-colors.txt"));
  assert.equal(parsed.header, "색깔");
  assert.equal(parsed.question, "어떤 색이 좋아?");
  assert.deepEqual(parsed.choices, [
    { n: 1, label: "빨강" },
    { n: 2, label: "파랑" },
    { n: 3, label: "초록" },
    { n: 4, label: "Type something." },
    { n: 5, label: "Chat about this" },
  ]);
});

test("parseChoices skips the transcript line above the divider", () => {
  const parsed = parseChoices(fixture("ask-colors.txt"));
  assert.ok(!parsed.question.includes("과거 목록"));
  assert.ok(parsed.choices.every((choice) => !choice.label.includes("과거 목록")));
});

test("parseChoices reads a long question with indented descriptions", () => {
  const parsed = parseChoices(fixture("ask-long.txt"));
  assert.equal(parsed.header, "Retry policy");
  assert.ok(parsed.question.startsWith("GET /reports"));
  assert.deepEqual(parsed.choices, [
    { n: 1, label: "Back off, keep three tries (Recommended)" },
    { n: 2, label: "One retry, then fail" },
    { n: 3, label: "Type something." },
    { n: 4, label: "Chat about this" },
  ]);
});

test("parseChoices reads a boxed permission prompt", () => {
  const parsed = parseChoices(fixture("permission.txt"));
  assert.equal(parsed.header, null);
  assert.equal(parsed.question, "Do you want to proceed?");
  assert.deepEqual(parsed.choices, [
    { n: 1, label: "Yes" },
    { n: 2, label: "Yes, and don't ask again for ls commands" },
    { n: 3, label: "No, and tell Claude what to do (esc)" },
  ]);
});

test("parseChoices returns null when there is no numbered choice", () => {
  assert.equal(parseChoices("hello\nworld"), null);
});

const session = (address, status, statusUpdatedAt = 0) => ({ address, status, statusUpdatedAt });

test("actionQueue keeps blocked decisions regardless of the dismiss map", () => {
  const queue = actionQueue([session("a", "blocked"), session("b", "working")], { a: "blocked", b: "done" });
  assert.deepEqual(queue.map((s) => s.address), ["a"]);
});

test("actionQueue drops done reports the reader dismissed", () => {
  const queue = actionQueue([session("a", "blocked"), session("b", "done"), session("c", "done")], { b: "done" });
  assert.deepEqual(queue.map((s) => s.address), ["a", "c"]);
});

test("actionQueue keeps a session whose status no longer matches the dismiss map", () => {
  const queue = actionQueue([session("a", "blocked")], { a: "done" });
  assert.deepEqual(queue.map((s) => s.address), ["a"]);
});

test("ringSegments returns no arcs when every count is zero", () => {
  assert.deepEqual(ringSegments({}, ORDER), []);
  assert.deepEqual(ringSegments({ blocked: 0, done: 0, working: 0, idle: 0 }, ORDER), []);
});

test("ringSegments splits a single status into two halves", () => {
  assert.deepEqual(ringSegments({ working: 4 }, ORDER), [
    { status: "working", from: -Math.PI / 2, sweep: Math.PI },
    { status: "working", from: Math.PI / 2, sweep: Math.PI },
  ]);
});

test("ringSegments splits two statuses in proportion to their counts", () => {
  const segments = ringSegments({ blocked: 1, done: 3 }, ORDER);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].status, "blocked");
  assert.equal(segments[0].from, -Math.PI / 2);
  assert.ok(Math.abs(segments[0].sweep - (0.5 * Math.PI - 0.08)) < 1e-9);
  assert.equal(segments[1].status, "done");
  assert.ok(Math.abs(segments[1].from) < 1e-9);
  assert.ok(Math.abs(segments[1].sweep - (1.5 * Math.PI - 0.08)) < 1e-9);
  const covered = segments.reduce((sum, seg) => sum + seg.sweep + 0.08, 0);
  assert.ok(Math.abs(covered - 2 * Math.PI) < 1e-9);
});

test("queueSubtitle prefers what a blocked session waits for", () => {
  assert.equal(queueSubtitle({ status: "blocked", waitingFor: "색 선택", name: "a" }), "색 선택");
});

test("queueSubtitle falls back for a blocked session with no reason", () => {
  assert.equal(queueSubtitle({ status: "blocked", name: "a" }), "Waiting for orders");
});

test("queueSubtitle drops a done title that repeats the name", () => {
  assert.equal(queueSubtitle({ status: "done", name: "합성곱", title: "합성곱" }), "Report in");
});

test("queueSubtitle shows a done report's distinct title", () => {
  assert.equal(queueSubtitle({ status: "done", name: "합성곱", title: "색깔 결정" }), "색깔 결정");
});

test("queueSubtitle ignores an empty done title", () => {
  assert.equal(queueSubtitle({ status: "done", name: "합성곱", title: "" }), "Report in");
});

test("rosterOf puts working first, then the rest, each by name, without blocked or done", () => {
  const roster = rosterOf([
    { name: "delta", status: "idle" },
    { name: "bravo", status: "working" },
    { name: "alpha", status: "blocked" },
    { name: "charlie", status: "idle" },
    { name: "echo", status: "done" },
    { name: "able", status: "working" },
  ]);
  assert.deepEqual(roster.map((item) => item.name), ["able", "bravo", "charlie", "delta"]);
});

test("rosterSlots shows the whole roster when it fits", () => {
  const roster = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(rosterSlots(roster, 12), { shown: roster, more: 0 });
});

test("rosterSlots trades the last slot for a count of the rest", () => {
  const roster = Array.from({ length: 14 }, (_, index) => ({ name: `s${index}` }));
  const slots = rosterSlots(roster, 12);
  assert.equal(slots.shown.length, 11);
  assert.equal(slots.more, 3);
});

test("waitLabel names the two wait reasons in English", () => {
  assert.equal(waitLabel("dialog open"), "Choice pending");
  assert.equal(waitLabel("Input Needed"), "Input needed");
});

test("waitLabel passes a Korean reason through and defaults an empty one", () => {
  assert.equal(waitLabel("색 선택"), "색 선택");
  assert.equal(waitLabel(null), "Waiting for orders");
});

test("statusDetail drops a done title that repeats the name", () => {
  assert.equal(statusDetail({ status: "done", name: "합성곱", title: "합성곱" }), "");
});

test("statusDetail shows a done report's distinct title", () => {
  assert.equal(statusDetail({ status: "done", name: "합성곱", title: "색깔 결정" }), "색깔 결정");
});

test("statusDetail translates what a blocked session waits for", () => {
  assert.equal(statusDetail({ status: "blocked", name: "합성곱", waitingFor: "input needed" }), "Input needed");
});

test("unitColumns keeps a narrow unit block in narrow mode", () => {
  assert.equal(unitColumns(840, 420).mode, "narrow");
});

test("unitColumns centres the middle panel on the window axis", () => {
  assert.deepEqual(unitColumns(2600, 1320), { mode: "sym", left: 764, mid: 1112, right: 724 });
});

test("unitColumns splits evenly when the centred panel would be too small", () => {
  const cols = unitColumns(1800, 920);
  assert.equal(cols.mode, "even");
  assert.equal(cols.left + cols.mid + cols.right, 1800);
});

test("unitColumns falls back to the unit's own middle without an axis", () => {
  const cols = unitColumns(2600, undefined);
  assert.equal(cols.mode, "sym");
  assert.equal(cols.left + cols.mid + cols.right, 2600);
});

test("chipGrid fits chips of at least the minimum width", () => {
  assert.deepEqual(chipGrid(1072), { perRow: 4, chipW: 262, capacity: 12 });
  assert.equal(chipGrid(100).perRow, 1);
});

test("chipMinWidth widens chips for long names within its bounds", () => {
  assert.equal(chipMinWidth(["short"]), 250);
  assert.equal(chipMinWidth(["lighthouse-web-checkout-form1"]), 291);
  assert.equal(chipMinWidth(["x".repeat(80)]), 360);
  assert.equal(chipMinWidth(["가".repeat(15)]), 275);
  assert.equal(chipGrid(1064, 291).perRow, 3);
});

test("sideWidth keeps the narrow unit block's side column between its bounds", () => {
  assert.equal(sideWidth(920), 331);
  assert.equal(sideWidth(600), 300);
  assert.equal(sideWidth(1499), 540);
  assert.equal(sideWidth(4000), 720);
  assert.equal(sideWidth(0), 420);
});

test("buildSessions takes each session's branch from its own pane", () => {
  const space = { id: "s1", name: "Space", branch: "main" };
  const agents = [
    { address: "t1", pane: "p1", space: "s1", status: "working" },
    { address: "t2", pane: "p2", space: "s1", status: "working" },
  ];
  const panes = [{ pane: "p1", branch: "feature/a" }, { pane: "p2", branch: "fix/b" }];
  const sessions = buildSessions(agents, [space], null, panes);
  assert.deepEqual(sessions.map((s) => s.branch), ["feature/a", "fix/b"]);
  assert.ok(sessions.every((s) => s.branch !== "main"));
});

test("buildSessions keeps a null pane branch and a pane missing from the list as null", () => {
  const agents = [
    { address: "t1", pane: "p1", space: "s1", status: "working" },
    { address: "t2", pane: "p9", space: "s1", status: "working" },
  ];
  const sessions = buildSessions(agents, [{ id: "s1", branch: "main" }], null, [{ pane: "p1", branch: null }]);
  assert.deepEqual(sessions.map((s) => s.branch), [null, null]);
});

test("buildSessions gives null branches when called without a pane list", () => {
  const agents = [{ address: "t1", pane: "p1", space: "s1", status: "working" }];
  const sessions = buildSessions(agents, [{ id: "s1", branch: "main" }], null);
  assert.deepEqual(sessions.map((s) => s.branch), [null]);
});

test("decreePicks preselects only the terminal it was opened for", () => {
  const sessions = [{ address: "t1", status: "blocked" }, { address: "t2", status: "working" }];
  assert.deepEqual(decreePicks(sessions, "t2"), ["t2"]);
  assert.deepEqual(decreePicks(sessions, "t1"), ["t1"]);
});

test("decreePicks preselects nothing without or beyond a terminal", () => {
  const sessions = [{ address: "t1", status: "blocked" }, { address: "t2", status: "working" }];
  assert.deepEqual(decreePicks(sessions, undefined), []);
  assert.deepEqual(decreePicks(sessions, "t9"), []);
});

test("decreeTargets sends to working picks and skips waiting ones by name", () => {
  const sessions = [
    { address: "t1", status: "blocked", name: "Alpha" },
    { address: "t2", status: "working", name: "Bravo" },
  ];
  assert.deepEqual(decreeTargets(sessions, new Set(["t1", "t2", "t9"])), {
    send: ["t2"],
    skipped: ["Alpha"],
  });
});

test("decreeBlocker asks for instructions before anything else", () => {
  const sessions = [{ address: "t2", status: "working", name: "Bravo" }];
  assert.equal(decreeBlocker(sessions, new Set(["t2"]), "   "), "Write the instructions first");
});

test("decreeBlocker asks for a session when nothing is picked", () => {
  const sessions = [{ address: "t2", status: "working", name: "Bravo" }];
  assert.equal(decreeBlocker(sessions, new Set(), "do it"), "Choose at least one session");
});

test("decreeBlocker refuses a decree that only reaches waiting sessions", () => {
  const sessions = [{ address: "t1", status: "blocked", name: "Alpha" }];
  assert.equal(
    decreeBlocker(sessions, new Set(["t1"]), "do it"),
    "Waiting sessions can't take a decree; answer them first",
  );
});

test("decreeBlocker clears once a working session is picked", () => {
  const sessions = [
    { address: "t1", status: "blocked", name: "Alpha" },
    { address: "t2", status: "working", name: "Bravo" },
  ];
  assert.equal(decreeBlocker(sessions, new Set(["t2"]), "do it"), null);
});

test("reportMinutes measures a done report from the tab's last change, not its settle time", () => {
  const now = 1_000_000_000_000;
  const tab = { settled_at: now - 180 * 60000, changed_at: now - 5 * 60000 };
  assert.equal(reportMinutes({ status: "done" }, tab, now), 5);
});

test("reportMinutes measures a done report without a tab from its status stamp", () => {
  const now = 1_000_000_000_000;
  assert.equal(reportMinutes({ status: "done", statusUpdatedAt: now - 7 * 60000 }, null, now), 7);
});

test("reportMinutes measures a working session from the tab's working_since", () => {
  const now = 1_000_000_000_000;
  const tab = { working_since: now - 3 * 60000, changed_at: now - 40 * 60000 };
  assert.equal(reportMinutes({ status: "working", startedAt: now - 100 * 60000 }, tab, now), 3);
});

test("reportMinutes measures a waiting session from the tab's change", () => {
  const now = 1_000_000_000_000;
  assert.equal(reportMinutes({ status: "blocked" }, { changed_at: now - 4 * 60000 }, now), 4);
});

test("reportMinutes measures a resting session from when it started", () => {
  const now = 1_000_000_000_000;
  assert.equal(reportMinutes({ status: "idle", startedAt: now - 9 * 60000 }, null, now), 9);
});

test("reportMinutes gives zero for a non-finite stamp", () => {
  const now = 1_000_000_000_000;
  assert.equal(reportMinutes({ status: "idle", startedAt: NaN }, null, now), 0);
  assert.equal(reportMinutes({ status: "blocked", statusUpdatedAt: Infinity }, null, now), 0);
});

test("newTabArgs drops the task for a plain shell", () => {
  assert.deepEqual(newTabArgs("s1", null, "rm -rf ~"), { space: "s1" });
});

test("newTabArgs trims the task and keeps the program", () => {
  assert.deepEqual(newTabArgs("s1", ["claude"], "  hi  "), { space: "s1", argv: ["claude"], task: "hi" });
});

test("newTabArgs drops a whitespace-only task and a missing space", () => {
  assert.deepEqual(newTabArgs(null, ["codex"], "  "), { argv: ["codex"] });
});
