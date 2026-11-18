import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { focusLog, resetFocusLog } from "./stubs/log.mjs";

const stubUrl = (name) => new URL(`./stubs/${name}.mjs`, import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "gpui-kit") return { url: stubUrl("gpui-kit"), shortCircuit: true };
    if (specifier === "gpui-base") return { url: stubUrl("gpui-base"), shortCircuit: true };
    if (specifier === "herdr") return { url: stubUrl("herdr"), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const herdr = await import("./stubs/herdr.mjs");
const kit = await import("./stubs/gpui-kit.mjs");
const { default: Regent } = await import("../main.js");
const { openPanel } = await import("../views.js");

function reset() {
  herdr.resetState();
  resetFocusLog();
}

function createCx() {
  const spawns = [];
  const every = [];
  const after = [];
  const cx = {
    focus_handle: () => ({
      focus: () => focusLog.push(["focus", "handle"]),
      is_focused: () => false,
    }),
    timer: {
      every: (ms, fn) => { every.push({ ms, fn }); return {}; },
      after: (ms, fn) => { after.push({ ms, fn }); return {}; },
    },
    spawn: (fn) => {
      const promise = Promise.resolve().then(() => fn(cx));
      promise.catch(() => {});
      spawns.push(promise);
      return promise;
    },
    notify: () => {},
    stop_propagation: () => {},
  };
  return { cx, spawns, every, after };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const calls = () => herdr.getState().calls;

test("the bar does nothing while the host is checking", async () => {
  reset();
  herdr.setProps({});
  herdr.setChecking(true);
  const stub = createCx();
  new Regent().init({}, stub.cx);
  await flush();
  assert.equal(calls().exec.length, 0);
  assert.equal(stub.spawns.length, 0);
  assert.equal(stub.every.length, 0);
});

test("the bar starts polling once the host stops checking", async () => {
  reset();
  herdr.setProps({});
  herdr.setChecking(false);
  const stub = createCx();
  new Regent().init({}, stub.cx);
  assert.equal(stub.every.length, 3);
  await Promise.all(stub.spawns.slice(1));
  assert.ok(calls().exec.some(([, argv]) => String(argv?.[0]).endsWith("scan.sh")));
  assert.ok(calls().exec.some(([command]) => String(command).endsWith("cca")));
});

test("decree preselects the session it was opened for", async () => {
  reset();
  herdr.setAgents([
    { address: "t1", status: "blocked", title: "Alpha", pane: "p1", space: "s1" },
    { address: "t2", status: "working", title: "Bravo", pane: "p2", space: "s1" },
  ]);
  herdr.setProps({ role: "decree", terminal: "t2", overlay: "ov-9" });
  const stub = createCx();
  const view = new Regent();
  view.init({}, stub.cx);
  assert.deepEqual([...view.picked], ["t2"]);
  view.decreeInput.set_value("status please");
  view.sendDecree(stub.cx);
  await stub.spawns.at(-1);
  assert.deepEqual(calls().hc, [["send", "t2", "status please"]]);
  assert.deepEqual(calls().closeOverlay, ["ov-9"]);
});

test("decree for a Waiting session refuses to send", () => {
  reset();
  herdr.setAgents([
    { address: "t1", status: "blocked", title: "Alpha", pane: "p1", space: "s1" },
    { address: "t2", status: "working", title: "Bravo", pane: "p2", space: "s1" },
  ]);
  herdr.setProps({ role: "decree", terminal: "t1", overlay: "ov-10" });
  const stub = createCx();
  const view = new Regent();
  view.init({}, stub.cx);
  assert.deepEqual([...view.picked], ["t1"]);
  view.decreeInput.set_value("do it");
  view.sendDecree(stub.cx);
  assert.equal(calls().hc.length, 0);
  assert.equal(
    view.decreeError,
    "Waiting sessions can't take a decree; answer them first",
  );
  assert.deepEqual(calls().closeOverlay, []);
  view.togglePicked("t2", stub.cx);
  assert.equal(view.decreeError, null);
});

test("decree with no session picked refuses to send", () => {
  reset();
  herdr.setAgents([
    { address: "t1", status: "blocked", title: "Alpha", pane: "p1", space: "s1" },
    { address: "t2", status: "working", title: "Bravo", pane: "p2", space: "s1" },
  ]);
  herdr.setProps({ role: "decree", overlay: "ov-9" });
  const stub = createCx();
  const view = new Regent();
  view.init({}, stub.cx);
  assert.equal(view.picked.size, 0);
  view.decreeInput.set_value("do it");
  view.sendDecree(stub.cx);
  assert.equal(calls().hc.length, 0);
  assert.equal(view.decreeError, "Choose at least one session");
  assert.deepEqual(calls().closeOverlay, []);
});

test("the dialog's text field takes the keyboard, not the handle", () => {
  const cases = [
    ["found", "textarea"],
    ["decree", "textarea"],
    ["find", "input"],
    ["report", "handle"],
  ];
  for (const [role, kind] of cases) {
    reset();
    herdr.setProps({ role });
    const stub = createCx();
    const view = new Regent();
    view.init({}, stub.cx);
    assert.deepEqual(focusLog.at(-1), ["focus", kind], `${role}: synchronous focus`);
    stub.after.at(-1).fn();
    assert.deepEqual(focusLog.at(-1), ["focus", kind], `${role}: delayed focus`);
  }
});

test("opening a second dialog closes the first", () => {
  reset();
  const first = openPanel("report");
  const second = openPanel("help");
  assert.equal(first, "ov-1");
  assert.equal(second, "ov-2");
  assert.deepEqual(calls().closeOverlay, ["ov-1"]);
  assert.equal(herdr.shared("regent.panel"), "ov-2");
  const events = herdr.getState().events;
  const closeAt = events.findIndex(([kind, id]) => kind === "close" && id === "ov-1");
  const openAt = events.findIndex(([kind, id]) => kind === "open" && id === "ov-2");
  assert.ok(closeAt >= 0 && closeAt < openAt, "the first dialog closes before the second opens");
});

test("closing a dialog clears regent.panel only for itself", () => {
  reset();
  herdr.setShared("regent.panel", "ov-2");
  herdr.setProps({ role: "help", overlay: "ov-2" });
  const view = new Regent();
  view.init({}, createCx().cx);
  view.close();
  assert.equal(herdr.shared("regent.panel"), null);
  assert.deepEqual(calls().closeOverlay, ["ov-2"]);

  herdr.setShared("regent.panel", "ov-2");
  herdr.clearCalls();
  herdr.setProps({ role: "help", overlay: "ov-3" });
  const other = new Regent();
  other.init({}, createCx().cx);
  other.close();
  assert.equal(herdr.shared("regent.panel"), "ov-2");
  assert.deepEqual(calls().closeOverlay, ["ov-3"]);
});

test("Find acts only once", () => {
  reset();
  herdr.setProps({ role: "find", overlay: "ov-4" });
  herdr.setAgents([
    { address: "t1", status: "working", title: "Alpha", pane: "p1", space: "s1" },
    { address: "t2", status: "idle", title: "Bravo", pane: "p2", space: "s1" },
  ]);
  const view = new Regent();
  view.init({}, createCx().cx);
  view.openFound();
  view.openFound();
  assert.deepEqual(calls().run, [["pane.focus", { pane: "p1" }]]);
  assert.deepEqual(calls().closeOverlay, ["ov-4"]);
});

test("a plain shell only drops the task", () => {
  reset();
  herdr.setProps({ role: "found", overlay: "ov-5" });
  herdr.setSpaces([{ id: "s1", active: true, tabs: [] }]);
  const stub = createCx();
  const view = new Regent();
  view.init({}, stub.cx);
  view.pickAgent = 3;
  view.taskInput.set_value("echo hi");
  view.createSession();
  assert.deepEqual(calls().run, [["tab.new", { space: "s1" }]]);
  view.createSession();
  assert.equal(calls().run.length, 1);
});

test("a program session carries the instructions", () => {
  reset();
  herdr.setProps({ role: "found", overlay: "ov-5" });
  herdr.setSpaces([{ id: "s1", active: true, tabs: [] }]);
  const view = new Regent();
  view.init({}, createCx().cx);
  view.pickAgent = 0;
  view.taskInput.set_value("echo hi");
  view.createSession();
  assert.deepEqual(calls().run, [
    ["tab.new", { space: "s1", argv: ["claude"], task: "echo hi" }],
  ]);
});

test("clicking a map hex selects its session and focuses its pane", () => {
  reset();
  herdr.setProps({ role: "map" });
  herdr.setAgents([
    { address: "t1", status: "working", title: "Alpha", pane: "p1", space: "s1" },
  ]);
  herdr.setSpaces([{ id: "s1", name: "Space one", active: true, tabs: [] }]);
  herdr.setPanes([{ pane: "p1", branch: "feature/a" }]);
  const view = new Regent();
  view.init({}, createCx().cx);
  const tree = view.render(createCx().cx);
  const hex = kit.findById(tree, "regent-hex-t1");
  assert.ok(hex, "the hex for t1 is in the rendered tree");
  kit.recordOf(hex).handlers.click();
  assert.equal(herdr.shared("regent.sel"), "t1");
  assert.deepEqual(calls().run.at(-1), ["pane.focus", { pane: "p1" }]);
});
