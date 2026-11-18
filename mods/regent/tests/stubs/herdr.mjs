// herdr stub: one mutable state object the tests drive, plus call recorders.

const emptyCalls = () => ({
  exec: [],
  hc: [],
  run: [],
  notify: [],
  openOverlay: [],
  closeOverlay: [],
  setAgentOrder: [],
  setShared: [],
});

const state = {
  agentList: [],
  spaceList: [],
  paneList: [],
  sharedMap: new Map(),
  propValue: {},
  checkingValue: false,
  nextOverlay: 0,
  calls: emptyCalls(),
  events: [],
};

export function resetState() {
  state.agentList = [];
  state.spaceList = [];
  state.paneList = [];
  state.sharedMap = new Map();
  state.propValue = {};
  state.checkingValue = false;
  state.nextOverlay = 0;
  state.calls = emptyCalls();
  state.events = [];
}

export function clearCalls() {
  state.calls = emptyCalls();
  state.events = [];
}

export const getState = () => state;

export function setAgents(list) { state.agentList = list; }
export function setSpaces(list) { state.spaceList = list; }
export function setPanes(list) { state.paneList = list; }
export function setProps(value) { state.propValue = value; }
export function setChecking(value) { state.checkingValue = value; }

export const agents = () => state.agentList;
export const spaces = () => state.spaceList;
export const panes = () => state.paneList;
export const props = () => state.propValue;
export const checking = () => state.checkingValue;

export function shared(key) {
  return state.sharedMap.get(key);
}

export function setShared(key, value) {
  state.calls.setShared.push([key, value]);
  state.sharedMap.set(key, value);
}

export function exec(...args) {
  state.calls.exec.push(args);
  return Promise.resolve({ code: 0, stdout: "", stderr: "" });
}

export function hc(...args) {
  state.calls.hc.push(args.length === 1 && Array.isArray(args[0]) ? args[0] : args);
  return Promise.resolve({ code: 0, stdout: "", stderr: "" });
}

export function run(...args) {
  state.calls.run.push(args);
}

export function notify(...args) {
  state.calls.notify.push(args);
}

export function openOverlay(options) {
  state.nextOverlay += 1;
  const id = `ov-${state.nextOverlay}`;
  state.calls.openOverlay.push([options, id]);
  state.events.push(["open", id]);
  return id;
}

export function closeOverlay(id) {
  state.calls.closeOverlay.push(id);
  state.events.push(["close", id]);
}

export function setAgentOrder(addresses) {
  state.calls.setAgentOrder.push(addresses);
}

export function nextCommand() {
  return new Promise(() => {});
}

export const appHome = () => "/app";
