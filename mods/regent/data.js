// Pure data helpers for the Regent HUD: merging the live agent list with
// scan.sh's richer session records, and reading cca's porcelain.
import { BANNERS, PORTRAITS, SIGILS, ORDER } from "./tokens.js";

export const GLYPH = { blocked: "◆", done: "✓", working: "●", idle: "○" };

export function hashOf(text) {
  let h = 0;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function portraitOf(session) {
  if (!session || session.shell) return null;
  return PORTRAITS[hashOf(session.address) % PORTRAITS.length];
}

export function sigilOf(spaceId) {
  return SIGILS[hashOf(spaceId) % SIGILS.length];
}

export function bannerOf(spaceIndex) {
  const i = Number.isFinite(spaceIndex) ? spaceIndex : 0;
  return BANNERS[((i % BANNERS.length) + BANNERS.length) % BANNERS.length];
}

export function statusRank(status) {
  const i = ORDER.indexOf(status);
  return i < 0 ? ORDER.length : i;
}

// The title Claude Code sets is usually the session's own name; Herdr's tab
// fallback is only used when there is nobody named yet.
export function nameOf(agent) {
  const live = String(agent.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (live && !/^[~/]/.test(live) && !live.includes("@") && live !== agent.program?.name) return live;
  const tab = String(agent.tab_name ?? "");
  return tab && !/^\d+$/.test(tab) ? tab : agent.program?.name ?? agent.address;
}

export function spanLabel(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// scan.sh checklist states: done / now / side / left / blocked.
export function planOf(checklist) {
  const items = Array.isArray(checklist?.items) ? checklist.items : [];
  return items.map((item) => {
    const raw = item?.state;
    const state = raw === "done" ? "done" : raw === "now" ? "now" : raw === "blocked" ? "wait" : "todo";
    return { label: String(item?.label ?? ""), state, stateRaw: raw ?? null };
  });
}

export function parseScanStdout(stdout) {
  const sessions = [];
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value?.t === "s") sessions.push(value);
    } catch {}
  }
  return sessions;
}

// scan.sh names the Herdr-app terminal in where.terminalId; on other hosts the
// pane id is all there is. Herdr agents carry that id as their address.
export function pairScan(sessions) {
  const byAddress = {};
  for (const row of sessions) {
    const at = row?.where?.kind === "herdr-app" ? row.where.terminalId : row?.where?.paneId;
    if (at) byAddress[at] = row;
  }
  return byAddress;
}

export function buildSessions(agentList, spaceList, data) {
  const extra = data?.sessions ?? {};
  const spaceIndex = {};
  const spaceBranch = {};
  (spaceList ?? []).forEach((space, index) => {
    spaceIndex[space.id] = index;
    spaceBranch[space.id] = space.branch ?? null;
  });
  return (agentList ?? []).map((agent) => {
    const x = extra[agent.address] ?? {};
    const plan = Array.isArray(x.plan) ? x.plan : [];
    const done = plan.filter((step) => step.state === "done").length;
    return {
      address: agent.address,
      pane: agent.pane,
      space: agent.space,
      spaceName: agent.space_name,
      spaceIndex: spaceIndex[agent.space] ?? 0,
      branch: spaceBranch[agent.space] ?? null,
      tab: agent.tab,
      tabIndex: agent.tab_index,
      tabName: agent.tab_name,
      status: agent.status,
      program: agent.program,
      shell: Boolean(agent.program?.shell),
      focused: Boolean(agent.focused),
      title: agent.title,
      name: nameOf(agent),
      plan,
      planDone: done,
      waitingFor: x.waitingFor ?? null,
      startedAt: x.startedAt ?? null,
      statusUpdatedAt: x.statusUpdatedAt ?? null,
      context: Number.isFinite(x.context) ? x.context : null,
    };
  });
}

export function countsOf(sessions) {
  const counts = { blocked: 0, done: 0, working: 0, idle: 0 };
  for (const session of sessions ?? []) if (session.status in counts) counts[session.status] += 1;
  return counts;
}

export function ringSegments(counts, order) {
  const total = order.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const active = order.filter((status) => (counts[status] ?? 0) > 0);
  if (active.length === 1) {
    return [
      { status: active[0], from: -Math.PI / 2, sweep: Math.PI },
      { status: active[0], from: Math.PI / 2, sweep: Math.PI },
    ];
  }
  const gap = active.length > 1 ? 0.08 : 0;
  const arcs = [];
  let from = -Math.PI / 2;
  for (const status of active) {
    const span = ((counts[status] ?? 0) / total) * Math.PI * 2;
    arcs.push({ status, from, sweep: Math.max(span - gap, 0.001) });
    from += span;
  }
  return arcs;
}

const WAIT_LABEL = { "dialog open": "Choice pending", "input needed": "Input needed" };

export function waitLabel(raw) {
  if (!raw) return "Waiting for orders";
  return WAIT_LABEL[String(raw).trim().toLowerCase()] ?? raw;
}

export function statusDetail(session) {
  if (session.status === "blocked") return waitLabel(session.waitingFor);
  return session.title && session.title !== session.name ? session.title : "";
}

export function queueSubtitle(item) {
  if (item.status === "blocked") return waitLabel(item.waitingFor);
  return item.title && item.title !== item.name ? item.title : "Report in";
}

// The next-action queue: decisions first, oldest wait first, then reports.
export function queueOf(sessions) {
  const blocked = (sessions ?? []).filter((s) => s.status === "blocked")
    .sort((a, b) => (a.statusUpdatedAt ?? 0) - (b.statusUpdatedAt ?? 0));
  const done = (sessions ?? []).filter((s) => s.status === "done");
  return [...blocked, ...done];
}

// The same queue without reports the reader already dismissed; decisions stay
// regardless of what the dismiss map remembers.
export function actionQueue(sessions, dismissed) {
  return queueOf(sessions).filter((s) => !(s.status === "done" && dismissed?.[s.address] === "done"));
}

export function rosterOf(sessions) {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const rest = (sessions ?? []).filter((s) => s.status !== "blocked" && s.status !== "done");
  return [...rest.filter((s) => s.status === "working").sort(byName), ...rest.filter((s) => s.status !== "working").sort(byName)];
}

export function rosterSlots(roster, capacity) {
  const list = roster ?? [];
  if (list.length <= capacity) return { shown: list, more: 0 };
  const keep = Math.max(capacity - 1, 0);
  return { shown: list.slice(0, keep), more: list.length - keep };
}

export function orderAddresses(sessions) {
  return (sessions ?? []).slice()
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .map((s) => s.address);
}

export function selectedOf(sessions, sel) {
  return (sessions ?? []).find((s) => s.address === sel) ?? null;
}

export function currentAddress(agentList) {
  const focused = (agentList ?? []).find((a) => a.focused);
  return focused?.address ?? null;
}

// Selection falls back the way the design does: the stored address, the pane
// Herdr has focused, then the first thing in the queue.
export function resolveSelected(sessions, sel, agentList) {
  const chosen = selectedOf(sessions, sel);
  if (chosen) return chosen;
  const live = (agentList ?? []).find((a) => a.focused) ?? null;
  const byFocus = live ? (sessions ?? []).find((s) => s.address === live.address) : null;
  return byFocus ?? queueOf(sessions)[0] ?? (sessions ?? [])[0] ?? null;
}

const usageValue = (value) => (/^\d+(\.\d+)?$/.test(String(value ?? "")) ? Number(value) : null);

export function parseUsage(text) {
  let current = "default";
  const rows = {};
  for (const line of String(text ?? "").split("\n")) {
    const f = line.split("\t");
    if (f[0] === "C" && f[1]) current = f[1];
    else if (f[0] === "U" && f[1]) rows[f[1]] = { five: usageValue(f[2]), seven: usageValue(f[4]) };
  }
  return rows[current] ?? null;
}

const CHOICE_LINE = /^\s*[│|]?\s*(?:❯\s*)?(\d)\.\s+(.+?)\s*[│|]?\s*$/;
const BOX_CHARS = /[╭╮╰╯│─┌┐└┘├┤┬┴┼]/g;
const HEADER_GLYPH = /^[☐☒✔]/;

function boxless(line) {
  return String(line ?? "").replace(BOX_CHARS, "").replace(/\s+$/, "");
}

function choiceLabel(raw) {
  return String(raw ?? "").trim().replace(/\s*[│|]\s*$/, "").trim();
}

// The decision a Claude Code session is waiting on: the numbered choices at the
// bottom of its screen, the question box above them and, optionally, its header.
export function parseChoices(screen) {
  const lines = String(screen ?? "").split("\n");
  let last = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (CHOICE_LINE.test(lines[i])) { last = i; break; }
  }
  if (last < 0) return null;

  const found = [];
  for (let i = last; i >= 0; i -= 1) {
    const match = CHOICE_LINE.exec(lines[i]);
    if (match) {
      found.push({ n: Number(match[1]), label: choiceLabel(match[2]), at: i });
      continue;
    }
    const bare = boxless(lines[i]);
    if (!bare.trim() || FRAME_ONLY.test(bare) || /^ {4}/.test(bare)) continue;
    break;
  }

  found.sort((a, b) => a.n - b.n);
  const choices = [];
  for (const choice of found) {
    if (choice.n !== choices.length + 1) break;
    choices.push(choice);
  }
  if (!choices.length) return null;

  let top = choices[0].at - 1;
  while (top >= 0 && !boxless(lines[top]).trim()) top -= 1;
  const body = [];
  let questionAt = choices[0].at;
  for (; top >= 0; top -= 1) {
    const text = boxless(lines[top]).trim();
    if (!text || FRAME_ONLY.test(text)) break;
    body.unshift(text);
    questionAt = top;
    if (body.length >= 8) break;
  }

  let header = null;
  let above = questionAt - 1;
  for (let skipped = 0; above >= 0 && skipped < 2 && !boxless(lines[above]).trim(); skipped += 1) above -= 1;
  if (above >= 0) {
    const text = boxless(lines[above]).trim();
    if (HEADER_GLYPH.test(text)) header = text.replace(HEADER_GLYPH, "").trim();
  }
  if (header === null && body.length && HEADER_GLYPH.test(body[0])) {
    header = body.shift().trim().replace(HEADER_GLYPH, "").trim();
  }

  return { header, question: body.join("\n").trim(), choices: choices.map(({ n, label }) => ({ n, label })) };
}

// Box-drawing rules and blank lines carry nothing once the frame is gone.
const FRAME_ONLY = /^[\s─-╿]*$/;

export function tailLines(screen, count = 12) {
  const lines = String(screen ?? "").split("\n").filter((line) => !FRAME_ONLY.test(line));
  return lines.slice(-count);
}

export function fmtClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function unitColumns(width, axis, left = 764) {
  if (!(width >= 1500)) return { mode: "narrow", left: 0, mid: 0, right: 0 };
  const half = (Number.isFinite(axis) ? axis : width / 2) - left;
  const right = width - left - half * 2;
  if (half * 2 >= 600 && right >= 520) return { mode: "sym", left, mid: half * 2, right };
  const each = Math.floor((width - left) / 2);
  return { mode: "even", left, mid: each, right: width - left - each };
}

export function sideWidth(width) {
  if (!(width > 0)) return 420;
  return Math.min(720, Math.max(300, Math.round(width * 0.36)));
}

export function chipMinWidth(names, base = 250, max = 360) {
  const cells = (name) => [...String(name ?? "")].reduce((n, ch) => n + (ch.codePointAt(0) >= 0x1100 ? 1.8 : 1), 0);
  const longest = (names ?? []).reduce((n, name) => Math.max(n, cells(name)), 0);
  return Math.min(max, Math.max(base, 64 + Math.ceil(longest * 7.8)));
}

export function chipGrid(inner, min = 250, gap = 8, rows = 3) {
  const perRow = Math.max(1, Math.floor((inner + gap) / (min + gap)));
  const chipW = Math.floor((inner - (perRow - 1) * gap) / perRow);
  return { perRow, chipW, capacity: perRow * rows };
}
