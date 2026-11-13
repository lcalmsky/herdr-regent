// The seven dialogs. Each copy gets props().role and props().overlay and draws
// its own gold frame, because openOverlay uses frame: "none".
import { div, image } from "gpui-kit";
import { h_flex, v_flex, Input, Textarea } from "gpui-base";
import { closeOverlay, exec, notify, props, run } from "herdr";
import { liveAgents, liveData, liveSpaces } from "./source.js";
import { A, C, FONT } from "./tokens.js";
import { GLYPH, buildSessions, nameOf, portraitOf, sigilOf, statusRank } from "./data.js";

const INK = C.ink;
const INK2 = C.ink2;
const MUTED = C.muted;
const LINE = C.rule;
const GOLD = C.accent;

const AGENT_PICKS = [
  { name: "Claude Code", portrait: "scholar", argv: ["claude"] },
  { name: "Codex", portrait: "general", argv: ["codex"] },
  { name: "Gemini", portrait: "astronomer", argv: ["gemini"] },
  { name: "Shell only", portrait: null, argv: null },
];

function art(path) {
  return image(`${A}/${path}`);
}

function label(value, size, color = INK, family = FONT.body) {
  return div().text_size(size).font_family(family).text_color(color).child(String(value ?? ""));
}

function clipped(value, size, color = INK, family = FONT.body) {
  return div().min_w(0).truncate().text_size(size).font_family(family).text_color(color).child(String(value ?? ""));
}

function keycap(text) {
  return div().h(20).min_w(20).flex_none().flex().items_center().justify_center()
    .px(4).rounded(3).border(1).border_color(LINE).bg(C.paper2)
    .text_size(10).line_height("14px").font_family(FONT.mono).text_color(MUTED).child(text);
}

// The corner art points one way and the runtime has no image flip, so only the
// top-left one is drawn; the bottom pair used to cover the footer buttons.
function corners() {
  return [art("ui/corner.png").absolute().left(6).top(6).w(40).h(40)];
}

function shell(view, body, footer) {
  return v_flex().id("regent-overlay").size_full().flex_none().relative().justify_start().bg(C.paper)
    .border(1).border_color(C.ruleStrong).rounded(6).overflow_hidden()
    .when(Boolean(view), (el) => el.track_focus(view.handle)
      .on_key_down((event, cx) => view.overlayKey(event, cx)))
    .children(body)
    .when(Boolean(footer), (el) => el.child(footer))
    .children(corners());
}

function artHeader(path, height) {
  return div().relative().w_full().h(height).flex_none()
    .child(art(path).absolute().left(0).top(0).w_full().h(height));
}

function heading(title, sub) {
  return v_flex().flex_none().items_center().gap(3).py(8).px(20)
    .child(label(title, 20, INK, FONT.display).font_bold())
    .when(Boolean(sub), (el) => el.child(label(sub, 12, MUTED)))
    .child(art("ui/divider.png").mt(2).w(200).h(12));
}

function actionButton(id, text, opts = {}) {
  const { primary = false, quiet = false, key = null, onPress } = opts;
  return div().id(`regent-btn-${id}`).h(32).flex_none().px(12).flex().items_center().gap(6).rounded(4)
    .border(1).border_color(primary ? GOLD : LINE).bg(primary ? GOLD : quiet ? C.paper : C.paper2)
    .cursor_pointer().hover((s) => s.border_color(GOLD))
    .on_click(onPress)
    .child(label(text, 13, primary ? C.accentInk : INK).when(primary, (el) => el.font_semibold()))
    .when(Boolean(key), (el) => el.child(keycap(key)));
}

function footerBar(hint, buttons) {
  return h_flex().flex_none().h(52).px(20).gap(8).items_center().border_t(1).border_color(LINE)
    .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(FONT.body).text_color(MUTED).child(hint ?? ""))
    .children(buttons);
}

function hexFacePic(face, sigil, width, height) {
  return div().relative().w(width).h(height).flex_none()
    .when(Boolean(face), (el) => el.child(art(`portrait/${face}.jpg`).absolute()
      .left(0).top(0).w(width).h(height).rounded(3)))
    .when(!face, (el) => el.child(div().absolute().left(0).top(0).w(width).h(height).rounded(3)
      .bg(C.paper2).flex().items_center().justify_center()
      .child(art(`sigil/${sigil}.png`).w(width * 0.6).h(height * 0.6))))
    .child(art("ui/hex-frame.png").absolute().left(0).top(0).w(width).h(height));
}

function hexFace(session, width, height) {
  return hexFacePic(session ? portraitOf(session) : null, session ? sigilOf(session.space) : "owl", width, height);
}

// ===== decision =====

export function renderDecision(view) {
  const p = props() ?? {};
  const list = liveAgents();
  const agent = list.find((a) => a.address === p.terminal) ?? null;
  const title = `${agent ? nameOf(agent) : p.terminal ?? "session"}: waiting for a decision`;
  const waited = view.waitLabel;
  const sub = `${agent?.space_name ?? "—"}, ${agent?.program?.name ?? "terminal"}, ${waited}`;
  const body = v_flex().flex_1().min_h(0).justify_start().overflow_y_scroll().px(24).py(10).gap(8);
  if (view.parsed === undefined) {
    body.child(label("Reading the terminal…", 13, MUTED).flex_none());
  } else if (view.parsed === null) {
    body.child(label("Couldn't read the question. These are the last lines.", 12, MUTED).flex_none());
    body.child(div().w_full().flex_none().rounded(4).bg(C.term).p(10)
      .child(label((view.screenTail ?? []).join("\n"), 12, C.termInk, FONT.mono)));
  } else {
    body.child(div().flex_none().text_size(14).font_family(FONT.body).text_color(INK).child(view.parsed.question || "What now?"));
    for (const choice of view.parsed.choices) {
      body.child(h_flex().id(`regent-choice-${choice.n}`).h(46).flex_none().px(10).gap(10).items_center()
        .border(1).border_color(LINE).rounded(4).bg(C.paper2).cursor_pointer()
        .hover((s) => s.border_color(GOLD).bg(C.paper3))
        .on_click((_event, cx) => view.answer(choice.n, cx))
        .child(div().relative().size(30).flex().items_center().justify_center()
          .child(art("ui/socket.png").absolute().left(0).top(0).w(30).h(30))
          .child(label(choice.n, 13, GOLD, FONT.mono).font_bold()))
        .child(div().flex_1().child(label(choice.label, 14, INK)))
        .child(keycap(String(choice.n))));
    }
  }
  const buttons = [
    actionButton("focus", "View in terminal", { quiet: true, onPress: () => view.focusTerminal() }),
    view.parsed === null ? null : actionButton("later", "Later", { quiet: true, key: "esc", onPress: () => view.close() }),
  ].filter(Boolean);
  return shell(view, [
    artHeader("event/decision.jpg", 120),
    heading(title, sub),
    body,
    footerBar(view.parsed?.choices?.length ? "Press a number to send that answer to the session" : "", buttons),
  ]);
}

// ===== complete =====

export function renderComplete(view) {
  const p = props() ?? {};
  const list = liveAgents();
  const agent = list.find((a) => a.address === p.terminal) ?? null;
  const name = agent ? nameOf(agent) : p.terminal ?? "session";
  const sub = `${agent?.space_name ?? "—"}, all ${view.planTotal ?? 0} checklist steps done`;
  const summary = view.summaryText ?? agent?.title ?? "A report is in.";
  const body = v_flex().flex_1().min_h(0).justify_start().overflow_y_scroll().px(24).py(10)
    .child(label(summary, 15, INK).flex_none());
  const buttons = [
    actionButton("open", "Open report", { primary: true, key: "↵", onPress: () => view.focusTerminal() }),
    actionButton("again", "Continue", { quiet: true, key: "esc", onPress: () => view.close() }),
  ];
  return shell(view, [
    artHeader("event/complete.jpg", 120),
    heading(`Task complete: ${name}`, sub),
    body,
    footerBar("", buttons),
  ]);
}

// ===== found =====

export function renderFound(view) {
  const spaceList = liveSpaces();
  const pickSpace = view.pickSpace ?? spaceList.find((s) => s.active)?.id ?? spaceList[0]?.id ?? null;
  const zone = (text) => label(text, 13, INK2).flex_none().pb(2);
  const chip = (id, on, content, onPress) => h_flex().id(`regent-chip-${id}`).h(36).flex_none().px(8).gap(6)
    .items_center().border(1).rounded(4).bg(on ? C.paper3 : C.paper2).cursor_pointer()
    .border_color(on ? GOLD : LINE).hover((s) => s.border_color(GOLD))
    .on_click(onPress).children(content);
  const spaceChips = spaceList.map((space) => chip(`space-${space.id}`, space.id === pickSpace, [
    art(`sigil/${sigilOf(space.id)}.png`).w(16).h(16),
    label(space.name, 12, INK2),
  ], (_event, cx) => view.pickFoundSpace(space.id, cx)));
  const agentChips = AGENT_PICKS.map((pick, index) => chip(`agent-${index}`, index === view.pickAgent, [
    ...(pick.portrait ? [hexFacePic(pick.portrait, "owl", 26, 30)] : []),
    label(pick.name, 12, INK2),
  ], (_event, cx) => view.pickFoundAgent(index, cx)));
  const body = v_flex().flex_1().min_h(0).justify_start().overflow_y_scroll().px(24).py(10).gap(8)
    .child(zone("Space"))
    .child(div().w_full().max_h(120).min_h(0).flex_shrink(1).overflow_y_scroll()
      .child(h_flex().flex_wrap().gap(6).children(spaceChips)))
    .child(zone("Agent"))
    .child(h_flex().flex_none().flex_wrap().gap(6).children(agentChips))
    .child(zone("First instructions"))
    .child(Textarea.new(view.taskInput).h(84).flex_none().rounded(4).border(1).border_color(C.ruleStrong).bg(C.term)
      .text_size(14).text_color(INK));
  const buttons = [
    actionButton("cancel", "Cancel", { quiet: true, onPress: () => view.close() }),
    actionButton("found", "Create", { primary: true, key: "⌘↵", onPress: () => view.createSession() }),
  ];
  return shell(view, [
    artHeader("art/founding.jpg", 120),
    heading("New session", null),
    body,
    footerBar("Opens in a new tab. Use ⌘⇧↵ to open beside.", buttons),
  ]);
}

// ===== decree =====

export function renderDecree(view) {
  const sessions = buildSessions(liveAgents(), liveSpaces(), null)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const rows = sessions.map((session) => {
    const on = view.picked.has(session.address);
    return h_flex().id(`regent-pick-${session.address}`).h(38).flex_none().px(8).gap(8).items_center()
      .rounded(4).hover((s) => s.bg(C.paper3)).cursor_pointer()
      .on_click((_event, cx) => view.togglePicked(session.address, cx))
      .child(div().flex_none().size(16).rounded(2).border(1).border_color(on ? GOLD : LINE)
        .when(on, (el) => el.bg(GOLD)))
      .child(hexFace(session, 24, 28))
      .child(clipped(session.name, 13, INK, FONT.display).flex_1())
      .child(label(session.spaceName, 11, MUTED))
      .child(div().flex_none().w(12).flex().items_center().justify_center()
        .child(label(GLYPH[session.status] ?? "○", 11, (C[session.status] ?? C.idle))));
  });
  const body = v_flex().flex_1().min_h(0).justify_start().overflow_y_scroll().px(24).py(10).gap(8)
    .child(div().w_full().flex_none().rounded(4).border(1).border_color(LINE).bg(C.term).p(4)
      .child(v_flex().justify_start().gap(1).children(rows)))
    .child(label("Instructions", 13, INK2).flex_none().pb(2))
    .child(Textarea.new(view.decreeInput).h(76).flex_none().rounded(4).border(1).border_color(C.ruleStrong).bg(C.term)
      .text_size(14).text_color(INK));
  const buttons = [
    actionButton("cancel", "Cancel", { quiet: true, onPress: () => view.close() }),
    actionButton("send", "Send", { primary: true, key: "⌘↵", onPress: (_event, cx) => view.sendDecree(cx) }),
  ];
  return shell(view, [
    heading("Decree", "Send the same instructions to the chosen sessions"),
    body,
    footerBar("Working sessions take it after their current reply", buttons),
  ]);
}

// ===== find =====

export function renderFind(view) {
  const query = (view.searchInput.value() ?? "").trim().toLowerCase();
  const sessions = buildSessions(liveAgents(), liveSpaces(), null);
  const matched = sessions
    .filter((s) => !query || s.name.toLowerCase().includes(query) || s.spaceName.toLowerCase().includes(query))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const commands = [
    ["found", "New session", "⌘T"],
    ["decree", "Send decree", "⌘⇧E"],
    ["report", "Report", "⌘R"],
    ["help", "Shortcuts", "⌘/"],
  ].filter((cmd) => !query || cmd[1].toLowerCase().includes(query));
  const rows = [];
  if (matched.length) {
    rows.push(div().px(16).py(4).child(label("Sessions", 11, MUTED)));
    matched.forEach((session, index) => {
      const on = index === view.findAt;
      rows.push(h_flex().id(`regent-find-${session.address}`).h(36).flex_none().px(16).gap(8).items_center()
        .when(on, (el) => el.bg(C.paper3))
        .hover((s) => s.bg(C.paper3)).cursor_pointer()
        .on_click(() => view.openFind(session.address))
        .child(hexFace(session, 24, 28))
        .child(clipped(session.name, 13, INK, FONT.display))
        .child(label(session.spaceName, 11, MUTED))
        .child(div().flex_1())
        .child(label(GLYPH[session.status] ?? "○", 11, (C[session.status] ?? C.idle))));
    });
  }
  if (commands.length) {
    rows.push(div().px(16).py(4).child(label("Commands", 11, MUTED)));
    commands.forEach((cmd, index) => {
      const on = matched.length + index === view.findAt;
      rows.push(h_flex().id(`regent-find-cmd-${cmd[0]}`).h(36).flex_none().px(16).gap(8).items_center()
        .when(on, (el) => el.bg(C.paper3))
        .hover((s) => s.bg(C.paper3)).cursor_pointer()
        .on_click(() => view.openFindCommand(cmd[0]))
        .child(div().size(24).flex_none())
        .child(label(cmd[1], 13, INK, FONT.display))
        .child(div().flex_1())
        .child(keycap(cmd[2])));
    });
  }
  if (!rows.length) {
    rows.push(v_flex().px(16).py(10).gap(3)
      .child(label(`No sessions match “${query}”`, 14, INK, FONT.display))
      .child(label("Press ↵ to start a new session with this name.", 12, MUTED)));
  }
  return shell(view, [
    h_flex().flex_none().h(52).px(16).items_center().border_b(1).border_color(LINE)
      .child(div().flex_1().min_w(0).on_key_down((event, cx) => view.findKey(event, cx))
        .child(Input.new(view.searchInput).h(48).w_full().rounded(0).border(0)
          .text_size(16).text_color(INK))),
    div().flex_1().min_h(0).overflow_y_scroll().py(4).children(rows),
    footerBar("↑↓ select · ↵ open · esc close", []),
  ]);
}

// ===== report =====

export function renderReport() {
  const sessions = buildSessions(liveAgents(), liveSpaces(), liveData());
  const now = Date.now();
  const tabOf = {};
  for (const space of liveSpaces()) for (const tab of space.tabs ?? []) tabOf[tab.id] = tab;
  const minutesSince = (stamp) => (Number.isFinite(stamp) ? Math.max(0, Math.round((now - stamp) / 60000)) : 0);
  const rows = sessions.map((session) => {
    const tab = tabOf[session.tab] ?? null;
    const minutes = session.status === "working" ? minutesSince(tab?.working_since ?? session.startedAt)
      : session.status === "blocked" ? minutesSince(tab?.changed_at ?? session.statusUpdatedAt)
        : session.status === "done" ? minutesSince(tab?.settled_at ?? session.statusUpdatedAt)
          : minutesSince(session.startedAt);
    return {
      session,
      minutes,
      working: session.status === "working" ? minutes : 0,
      blocked: session.status === "blocked" ? minutes : 0,
      done: session.status === "done" ? minutes : 0,
    };
  }).sort((a, b) => b.minutes - a.minutes).slice(0, 14);
  const max = Math.max(1, ...rows.map((row) => row.minutes));
  const legendDot = (color, text) => h_flex().items_center().gap(4)
    .child(div().size(8).rounded(4).bg(color)).child(label(text, 11, MUTED));
  const body = v_flex().flex_1().min_h(0).justify_start().overflow_y_scroll().px(24).py(8).gap(6)
    .child(h_flex().flex_none().gap(16).items_center()
      .child(legendDot(C.working, "Working time"))
      .child(legendDot(C.blocked, "Waiting time"))
      .child(legendDot(C.done, "Unread report time"))
      .child(label("Approximate", 11, MUTED)))
    .children(rows.map((row) => h_flex().h(34).flex_none().gap(10).items_center()
      .child(hexFace(row.session, 26, 30))
      .child(div().w(130).flex_none().truncate().text_size(13).font_family(FONT.display).text_color(INK).child(row.session.name))
      .child(div().relative().h(14).flex_1().rounded(2).bg(C.paper2)
        .child(h_flex().absolute().left(0).top(0).h(14).w(`${(row.working / max) * 100}%`).bg(C.working))
        .child(h_flex().absolute().left(`${(row.working / max) * 100}%`).top(0).h(14).w(`${(row.blocked / max) * 100}%`).bg(C.blocked))
        .child(h_flex().absolute().left(`${((row.working + row.blocked) / max) * 100}%`).top(0).h(14).w(`${(row.done / max) * 100}%`).bg(C.done)))
      .child(div().w(48).flex_none().text_size(11).font_family(FONT.mono).text_color(MUTED).child(`${row.minutes}m`))));
  return shell(null, [
    heading("Today's record", null),
    h_flex().flex_none().justify_center().gap(4).px(20)
      .child(div().h(30).px(12).flex().items_center().border_b(2).border_color(GOLD).child(label("By session", 12, INK)))
      .child(div().h(30).px(12).flex().items_center().child(label("By space", 12, MUTED)))
      .child(div().h(30).px(12).flex().items_center().child(label("By account", 12, MUTED))),
    body,
    footerBar("", [actionButton("close", "Close", { quiet: true, key: "esc", onPress: () => closeOverlay(props().overlay) })]),
  ]);
}

// ===== help =====

const HELP_ROWS = [
  ["To the next session needing a decision (else a report)", ["⌘", "↵"]],
  ["Mark all reports read", ["⌘", "⇧", "↵"]],
  ["Previous / next session", ["⌘[", "⌘]"]],
  ["Switch space", ["⌃1", "⌃9"]],
  ["Switch tab", ["⌘1", "⌘9"]],
  ["Find", ["⌘K"]],
  ["New session", ["⌘T"]],
  ["Decree", ["⌘⇧E"]],
  ["Report", ["⌘R"]],
  ["Status filter", ["⌘⇧1", "⌘⇧4"]],
  ["This window", ["⌘/"]],
];

const HELP_DECISION = [
  ["Send that answer to the session", ["1", "2", "3"]],
  ["View in terminal", ["↵"]],
  ["Later", ["esc"]],
];

const HELP_HUD = [
  ["Pick a session in the ribbon", ["←", "→"]],
  ["Go to terminal", ["↵"]],
  ["Pick decree targets", ["x"]],
  ["Decree", ["e"]],
  ["Rest", ["z"]],
  ["Back to the terminal", ["esc"]],
];

function helpColumn(title, rows) {
  return v_flex().flex_1().min_w(0).gap(2).justify_start()
    .child(label(title, 13, GOLD, FONT.display).flex_none().font_bold().pb(4))
    .children(rows.map(([text, keys]) => h_flex().h(28).flex_none().justify_between().items_center().py(3)
      .border_b(1).border_color(LINE)
      .child(label(text, 12, INK2))
      .child(h_flex().flex_none().gap(3).items_center().children(keys.map((key) => keycap(key))))));
}

export function renderHelp() {
  return shell(null, [
    heading("Shortcuts", null),
    h_flex().flex_1().min_h(0).items_start().overflow_y_scroll().px(24).py(8).gap(24)
      .child(helpColumn("Everywhere", HELP_ROWS))
      .child(v_flex().flex_1().min_w(0).gap(6).justify_start()
        .child(helpColumn("When the decision dialog is open", HELP_DECISION))
        .child(helpColumn("When the HUD has the keyboard (⌃⌥P)", HELP_HUD))),
    footerBar("⌃ combos the terminal programs use are never taken",
      [actionButton("close", "Close", { quiet: true, key: "esc", onPress: () => closeOverlay(props().overlay) })]),
  ]);
}
