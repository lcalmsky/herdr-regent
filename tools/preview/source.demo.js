const MIN = 60000;
const ago = (minutes) => Date.now() - minutes * MIN;

const PROGRAM = {
  key: "claude",
  name: "Claude Code",
  icon: null,
  tint: true,
  tile: null,
  color: null,
  shell: false,
  agent: true,
};

const PLAN = [
  { label: "Read the limiter middleware", state: "done" },
  { label: "Add a per-key token bucket", state: "done" },
  { label: "Apply migration 0042 on staging", state: "wait" },
  { label: "Run the load test", state: "todo" },
  { label: "Write the rollout note", state: "todo" },
];

const ROWS = [
  { address: "t01", pane: "p01", space: "sp1", spaceName: "orchard-api", tab: "tab-rate-limits", tabIndex: 1, tabName: "rate-limits", name: "rate-limits", status: "blocked", minutes: 4, focused: true, context: 34, waitingFor: "dialog open", plan: PLAN },
  { address: "t02", pane: "p02", space: "sp1", spaceName: "orchard-api", tab: "tab-load-test", tabIndex: 2, tabName: "load-test", name: "load-test", status: "working", minutes: 12, focused: false, context: 51, waitingFor: null, plan: [] },
  { address: "t03", pane: "p03", space: "sp1", spaceName: "orchard-api", tab: "tab-docs", tabIndex: 3, tabName: "docs", name: "docs", status: "idle", minutes: 120, focused: false, context: 18, waitingFor: null, plan: [] },
  { address: "t04", pane: "p04", space: "sp2", spaceName: "lighthouse-web", tab: "tab-checkout-form", tabIndex: 1, tabName: "checkout-form", name: "checkout-form", status: "done", minutes: 6, focused: false, context: 42, waitingFor: null, plan: [] },
  { address: "t05", pane: "p05", space: "sp2", spaceName: "lighthouse-web", tab: "tab-a11y-audit", tabIndex: 2, tabName: "a11y-audit", name: "a11y-audit", status: "working", minutes: 3, focused: false, context: 63, waitingFor: null, plan: [] },
  { address: "t06", pane: "p06", space: "sp3", spaceName: "driftwood", tab: "tab-sync-retry", tabIndex: 1, tabName: "sync-retry", name: "sync-retry", status: "blocked", minutes: 18, focused: false, context: 27, waitingFor: "input needed", plan: [] },
  { address: "t07", pane: "p07", space: "sp3", spaceName: "driftwood", tab: "tab-schema-v2", tabIndex: 2, tabName: "schema-v2", name: "schema-v2", status: "done", minutes: 41, focused: false, context: 12, waitingFor: null, plan: [] },
  { address: "t08", pane: "p08", space: "sp4", spaceName: "quill-docs", tab: "tab-api-reference", tabIndex: 1, tabName: "api-reference", name: "api-reference", status: "working", minutes: 25, focused: false, context: 47, waitingFor: null, plan: [] },
  { address: "t09", pane: "p09", space: "sp4", spaceName: "quill-docs", tab: "tab-changelog", tabIndex: 2, tabName: "changelog", name: "changelog", status: "idle", minutes: 300, focused: false, context: 22, waitingFor: null, plan: [] },
  { address: "t10", pane: "p10", space: "sp5", spaceName: "harbor-infra", tab: "tab-node-22", tabIndex: 1, tabName: "node-22", name: "node-22", status: "working", minutes: 1, focused: false, context: 71, waitingFor: null, plan: [] },
  { address: "t11", pane: "p11", space: "sp5", spaceName: "harbor-infra", tab: "tab-backup-drill", tabIndex: 2, tabName: "backup-drill", name: "backup-drill", status: "done", minutes: 60, focused: false, context: 38, waitingFor: null, plan: [] },
  { address: "t12", pane: "p12", space: "sp5", spaceName: "harbor-infra", tab: "tab-cost-report", tabIndex: 3, tabName: "cost-report", name: "cost-report", status: "idle", minutes: 1440, focused: false, context: 25, waitingFor: null, plan: [] },
];

const SPACE_NAMES = {
  sp1: { name: "orchard-api", branch: "feat/rate-limits", status: "blocked" },
  sp2: { name: "lighthouse-web", branch: "main", status: "done" },
  sp3: { name: "driftwood", branch: "fix/flaky-sync", status: "blocked" },
  sp4: { name: "quill-docs", branch: "main", status: "working" },
  sp5: { name: "harbor-infra", branch: "chore/upgrade-node", status: "done" },
};

export const liveAgents = () => ROWS.map((row, index) => ({
  address: row.address,
  pane: row.pane,
  space: row.space,
  space_name: row.spaceName,
  tab: row.tab,
  tab_index: row.tabIndex,
  tab_name: row.tabName,
  status: row.status,
  app: "claude-code",
  program: PROGRAM,
  title: row.name,
  seq: ROWS.length - index,
  pinned: false,
  focused: row.focused,
}));

export const liveSpaces = () => ["sp1", "sp2", "sp3", "sp4", "sp5"].map((id, index) => {
  const meta = SPACE_NAMES[id];
  const tabs = ROWS.filter((row) => row.space === id).map((row, tabIndex) => ({
    id: row.tab,
    index: tabIndex + 1,
    name: row.tabName,
    named: true,
    active: tabIndex === 0,
    status: row.status,
    panes: 1,
    zoomed: false,
    settled: false,
    settled_at: null,
    changed_at: ago(row.minutes),
    working_since: row.status === "working" ? ago(row.minutes) : null,
  }));
  return {
    id,
    index: index + 1,
    name: meta.name,
    named: true,
    folder: "",
    machine: null,
    branch: meta.branch,
    active: index === 0,
    status: meta.status,
    tabs,
  };
});

export const liveData = () => ({
  sessions: Object.fromEntries(ROWS.map((row) => [
    row.address,
    {
      plan: row.plan,
      waitingFor: row.waitingFor,
      startedAt: ago(row.minutes + 25),
      statusUpdatedAt: ago(row.minutes),
      context: row.context,
    },
  ])),
  usage: { five: 62, seven: 38 },
  scanErrors: 0,
});
