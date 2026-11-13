// The seven in-layout roles of the Regent HUD. Each one draws inside its
// own block: settings live in shared state, live reads go through source.js,
// and the scan bar publishes the scan into shared state.
import { div, image, PathBuilder, Background } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, setShared, run, openOverlay, closeOverlay } from "herdr";
import { liveAgents, liveData, liveSpaces } from "./source.js";
import { A, C, FONT, ORDER, ST } from "./tokens.js";
import {
  GLYPH, actionQueue, bannerOf, buildSessions, chipGrid, chipMinWidth, countsOf, fmtClock, portraitOf, queueOf, queueSubtitle, resolveSelected,
  sideWidth, ringSegments, rosterOf, rosterSlots, sigilOf, spanLabel, statusDetail, statusRank, unitColumns, waitLabel,
} from "./data.js";

const DIALOG = { width: 640, height: 560 };
const WIDE = { width: 820, height: 600 };

const INK = C.ink;
const INK2 = C.ink2;
const MUTED = C.muted;
const LINE = C.rule;
const GOLD = C.accent;

export function liveSessions() {
  return buildSessions(liveAgents(), liveSpaces(), liveData());
}

export function selectedSession(sessions) {
  return resolveSelected(sessions, shared("regent.sel"), liveAgents());
}

export function statusGlyph(status, size = 10) {
  const color = (ST[status] ?? ST.idle).color;
  return div().flex_none().w(size + 2).h(size + 2).flex().items_center().justify_center()
    .text_size(size).line_height(`${size + 2}px`).text_color(color).child(GLYPH[status] ?? "○");
}

export function statusLabel(status) {
  return (ST[status] ?? ST.idle).label;
}

function label(value, size, color = INK, family = FONT.body) {
  return div().text_size(size).font_family(family).text_color(color).child(String(value ?? ""));
}

function clipped(value, size, color = INK, family = FONT.body) {
  return div().min_w(0).truncate().text_size(size).font_family(family).text_color(color).child(String(value ?? ""));
}

function keycap(text) {
  return div().flex_none().px(4).rounded(3).border(1).border_color(LINE).bg(C.paper2)
    .text_size(10).line_height("14px").font_family(FONT.mono).text_color(MUTED).child(text);
}

function art(path) {
  return image(`${A}/${path}`);
}

function fullRect() {
  return PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();
}

function circlePath(d) {
  const r = d / 2;
  return PathBuilder.fill().move_to(r, 0).arc_to(r, r, 0, false, true, r, d).arc_to(r, r, 0, false, true, r, 0).close().build();
}

function hudBackdrop() {
  return window.paint_path(fullRect(), Background.linear_gradient(180, C.paper2, C.paper)).absolute().left(0).top(0).size_full();
}

function hudRule() {
  return div().absolute().left(0).top(0).w_full().h(1).bg(C.ruleStrong).opacity(0.5);
}

function portraitPath(session) {
  const key = portraitOf(session);
  return key ? `${A}/portrait/${key}.jpg` : null;
}

// A hexagonal portrait: the photo behind the frame's transparent middle.
export function hexPortrait(session, width, height, radius = 4) {
  const face = portraitPath(session);
  const sigil = sigilOf(session.space);
  return div().relative().w(width).h(height).flex_none().overflow_hidden()
    .when(Boolean(face), (el) => el.child(art(`portrait/${portraitOf(session)}.jpg`).absolute()
      .left(width * 0.08).top(height * 0.08).w(width * 0.84).h(height * 0.84).rounded(radius)))
    .when(!face, (el) => el.child(div().absolute().left(width * 0.08).top(height * 0.08).w(width * 0.84).h(height * 0.84)
      .rounded(radius).bg(C.paper2).flex().items_center().justify_center()
      .child(art(`sigil/${sigil}.png`).w(width * 0.42).h(height * 0.42))))
    .child(art("ui/hex-frame.png").absolute().left(0).top(0).w(width).h(height));
}

// ===== bar =====

function ringArc(from, sweep, color) {
  const x0 = 22 + 19 * Math.cos(from);
  const y0 = 22 + 19 * Math.sin(from);
  const x1 = 22 + 19 * Math.cos(from + sweep);
  const y1 = 22 + 19 * Math.sin(from + sweep);
  return window.paint_path(PathBuilder.stroke(4).move_to(x0, y0)
    .arc_to(19, 19, 0, sweep > Math.PI, true, x1, y1).build(), color).absolute().left(0).top(0).size_full();
}

function statusRing(sessions) {
  const counts = countsOf(sessions);
  const steps = sessions.flatMap((s) => s.plan);
  const done = steps.filter((step) => step.state === "done").length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const late = sessions.filter((s) => s.status === "blocked" && s.statusUpdatedAt
    && Date.now() - s.statusUpdatedAt >= 3 * 60000).length;
  const total = ORDER.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const arcs = ringSegments(counts, ORDER).map((seg) => ringArc(seg.from, seg.sweep, ST[seg.status].color));
  const bits = `Waiting ${counts.blocked ?? 0} · Reported ${counts.done ?? 0} · Working ${counts.working ?? 0} · Resting ${counts.idle ?? 0}`;
  return div().id("regent-ring").relative().size(50).flex_none().hover((s) => s.opacity(0.85)).cursor_pointer()
    .tooltip(steps.length ? `${bits} · Checklist ${pct}%` : bits)
    .on_click(() => openPanel("report"))
    .child(div().absolute().left(3).top(3).size(44)
      .child(ringArc(-Math.PI / 2, Math.PI, C.paper3))
      .child(ringArc(Math.PI / 2, Math.PI, C.paper3))
      .children(arcs)
      .child(div().absolute().left(0).top(0).size_full().flex().items_center().justify_center()
        .child(steps.length
          ? label(`${pct}%`, 12, INK, FONT.mono).font_semibold()
          : label(total, 15, INK, FONT.mono).font_semibold())))
    .when(late > 0, (el) => el.child(div().absolute().right(0).top(0).size(16).rounded(8).bg(C.error)
      .flex().items_center().justify_center().child(label(late, 10, INK, FONT.mono).font_semibold())));
}

function quickButton(id, glyph, tooltip, role) {
  return div().id(`regent-qb-${id}`).size(28).flex_none().flex().items_center().justify_center().rounded(14)
    .border(1).border_color(LINE).bg(C.paper2).cursor_pointer()
    .hover((s) => s.border_color(GOLD).bg(C.paper3))
    .tooltip(tooltip)
    .on_click(() => openPanel(role))
    .child(label(glyph, 14, INK2));
}

function yieldItem(status, count, filter) {
  const on = filter === status;
  return div().id(`regent-yield-${status}`).h(32).flex_none().flex().items_center().gap(6).px(8).rounded(4)
    .when(on, (el) => el.bg(C.paper3))
    .hover((s) => s.bg(C.paper2)).cursor_pointer()
    .on_click(() => setShared("regent.filter", filter === status ? null : status))
    .child(statusGlyph(status, 10))
    .child(label(count, 17, INK, FONT.mono).font_semibold())
    .child(label(statusLabel(status), 13, INK2));
}

function usageGauge(name, value, w, h, tight = false) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const hot = value !== null && value > 85;
  const inset = Math.round(h / 3);
  return h_flex().flex_none().items_center().gap(tight ? 6 : 8)
    .child(label(name, 12, INK2))
    .child(div().relative().flex_none().w(w).h(h)
      .child(art("ui/bar-frame.png").absolute().left(0).top(0).size_full())
      .child(div().absolute().left("6%").top(inset).h(h - inset * 2).w(`${Math.round(pct * 0.88)}%`).rounded(2)
        .bg(hot ? C.error : GOLD)))
    .child(label(value === null ? "—" : `${value}%`, 13, hot ? C.error : INK, FONT.mono).w(tight ? 34 : 40));
}

export function renderBar(view) {
  const sessions = liveSessions();
  const counts = countsOf(sessions);
  const data = liveData() ?? {};
  const usage = data.usage ?? null;
  const filter = shared("regent.filter") ?? null;
  const barW = view?.size?.width ?? 0;
  const ribbonW = (shared("regent.size.ribbon") ?? [0])[0] || 0;
  const axis = (barW + ribbonW) / 2;
  const CENTER_W = 880;
  const centered = barW > 0 && axis - CENTER_W / 2 >= 760 && axis + CENTER_W / 2 <= barW - 16;
  const tight = barW > 0 && barW < 940;
  return h_flex().id("regent-bar").relative().size_full().flex_none().items_center().gap(10).pr(8).pl(80).bg(C.paper).overflow_hidden()
    .child(statusRing(sessions))
    .child(h_flex().flex_none().gap(12).children(ORDER.map((status) => yieldItem(status, counts[status] ?? 0, filter))))
    .child(div().flex_1())
    .when(!centered, (el) => el.child(h_flex().flex_none().items_center().gap(tight ? 10 : 14).pl(tight ? 10 : 14).border_l(1).border_color(LINE)
      .child(usageGauge("5h", usage?.five ?? null, tight ? 64 : 88, tight ? 13 : 18, tight))
      .child(usageGauge("7d", usage?.seven ?? null, tight ? 64 : 88, tight ? 13 : 18, tight))))
    .when(centered, (el) => el.child(h_flex().absolute().left(axis - CENTER_W / 2).top(0).w(CENTER_W).h_full()
      .items_center().justify_center().gap(20)
      .child(art("ui/divider.png").flex_none().w(108).h(18).opacity(0.9))
      .child(usageGauge("5h", usage?.five ?? null, 128, 26))
      .child(usageGauge("7d", usage?.seven ?? null, 128, 26))
      .child(art("ui/divider.png").flex_none().w(108).h(18).opacity(0.9))));
}

// ===== tabs =====

export function renderTabs() {
  const spaceList = liveSpaces();
  const active = spaceList.find((space) => space.active) ?? spaceList[0] ?? null;
  const tabs = active?.tabs ?? [];
  return h_flex().id("regent-tabs").relative().size_full().flex_none().items_stretch().bg(C.paper2)
    .child(div().absolute().left(0).top(0).w_full().h(1).bg(LINE))
    .child(h_flex().id("regent-tabs-list").flex_1().min_w(0).h_full().items_stretch().pl(8).gap(2).overflow_x_scroll()
      .children(tabs.map((tab) => {
        const on = tab.active;
        return h_flex().id(`regent-tab-${tab.id}`).relative().h_full().flex_none().items_center().gap(6).px(22).py(4)
          .hover((s) => s.opacity(0.85)).cursor_pointer()
          .on_click(() => run("tab.select", { id: tab.id }))
          .when(on, (el) => el.child(div().absolute().left(2).top(4).right(2).bottom(4).child(art("ui/plaque.png").size_full())))
          .when(Boolean(tab.status), (el) => el.child(statusGlyph(tab.status, 8)))
          .child(label(tab.name, 13, on ? INK : MUTED).when(on, (el) => el.font_semibold()))
          .child(label(`⌘${tab.index}`, 10, MUTED, FONT.mono));
      })))
    .child(h_flex().flex_none().h_full().items_center().gap(4).pl(10).pr(10)
      .child(quickButton("find", "⌕", "Find session ⌘K", "find"))
      .child(quickButton("found", "＋", "New session ⌘T", "found"))
      .child(quickButton("decree", "✦", "Decree ⌘⇧E", "decree"))
      .child(quickButton("help", "?", "Shortcuts ⌘/", "help")));
}

// ===== ribbon =====

function banner(session, selected) {
  const cloth = bannerOf(session.spaceIndex);
  const sigil = sigilOf(session.space);
  return div().id(`regent-ban-${session.address}`).relative().w(50).h(94).flex_none().cursor_pointer()
    .hover((s) => s.opacity(0.92))
    .tooltip(`${session.name}: ${session.status === "blocked" && session.waitingFor ? waitLabel(session.waitingFor) : statusLabel(session.status)}`)
    .on_click(() => {
      setShared("regent.sel", session.address);
      if (session.pane) run("pane.focus", { pane: session.pane });
    })
    .child(div().absolute().left(5).top(0).w(40).h(selected ? 92 : 86)
      .child(window.paint_path(PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "90%")
        .line_to("50%", "100%").line_to("0%", "90%").close().build(), cloth).absolute().left(0).top(0).size_full())
      .when(selected, (el) => el.child(div().absolute().left(0).top(0).w_full().h(2).bg(GOLD)))
      .child(art(`sigil/${sigil}.png`).absolute().left(14).top(66).w(12).h(12).opacity(0.85)))
    .child(div().absolute().left(2).top(4).w(46).h(50)
      .when(Boolean(portraitPath(session)), (el) => el.child(art(`portrait/${portraitOf(session)}.jpg`)
        .absolute().left(4).top(3).w(38).h(44).rounded(3)))
      .when(!portraitPath(session), (el) => el.child(div().absolute().left(4).top(3).w(38).h(44).rounded(3)
        .bg(C.paper).flex().items_center().justify_center()
        .child(art(`sigil/${sigil}.png`).w(18).h(18))))
      .child(art("ui/hex-frame.png").absolute().left(0).top(0).w(46).h(50)))
    .child(div().absolute().left(16).top(46).size(18).rounded(9).bg(C.paper)
      .border(1).border_color(session.status === "blocked" ? C.blocked : selected ? GOLD : LINE)
      .flex().items_center().justify_center()
      .child(statusGlyph(session.status, 10)));
}

export function renderRibbon() {
  const sessions = liveSessions();
  const filter = shared("regent.filter") ?? null;
  const selected = selectedSession(sessions);
  const data = liveData() ?? {};
  const shown = sessions.slice()
    .filter((session) => !filter || session.status === filter)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const clock = fmtClock();

  if (!sessions.length) {
    return h_flex().id("regent-ribbon").size_full().flex_none().items_center().justify_end().gap(8).px(10).bg(C.paper)
      .child(label("No sessions yet.", 13, INK2))
      .child(div().id("regent-first").h(30).px(12).flex().items_center().gap(5).rounded(4).bg(GOLD).cursor_pointer()
        .on_click(() => openPanel("found"))
        .child(label("Start the first session", 12, C.accentInk).font_semibold())
        .child(keycap("⌘T")));
  }
  if ((data.scanErrors ?? 0) >= 3) {
    return h_flex().id("regent-ribbon").size_full().flex_none().items_center().justify_end().gap(8).px(10).bg(C.paper)
      .child(label("Session scan failed 3 times in a row. Terminals still work.", 12, C.error))
      .child(div().id("regent-rescan").h(28).px(10).flex().items_center().rounded(4).border(1).border_color(LINE)
        .bg(C.paper2).cursor_pointer().hover((s) => s.border_color(GOLD))
        .on_click(() => setShared("regent.retry", Date.now()))
        .child(label("Scan again", 12, INK2)));
  }
  return div().id("regent-ribbon").relative().size_full().flex_none().bg(C.paper).overflow_hidden()
    .child(div().absolute().left(0).top(56).w_full().h(38).bg(C.paper2))
    .child(div().absolute().left(0).top(56).w_full().h(1).bg(LINE))
    .child(h_flex().absolute().left(0).right(52).top(0).h(94).items_start().gap(6).pl(4).overflow_x_scroll()
      .children(shown.map((session) => banner(session, session.address === selected?.address))))
    .child(div().absolute().right(6).top(34).px(4).rounded(3).bg(C.paper)
      .child(label(clock, 12, MUTED, FONT.mono)));
}

// ===== notes =====

export function renderNotes() {
  const sessions = liveSessions();
  const dismissed = shared("regent.dismissed") ?? {};
  const queue = queueOf(sessions);
  const shown = queue.filter((session) => dismissed[session.address] !== session.status);
  const closeNote = (session) => setShared("regent.dismissed", { ...(shared("regent.dismissed") ?? {}), [session.address]: session.status });
  return v_flex().id("regent-notes").size_full().flex_none().items_center().gap(4).py(6).bg(C.paper).overflow_y_scroll()
    .children(shown.map((session) => div().id(`regent-note-${session.address}`).relative().w(46).h(64).flex_none()
      .cursor_pointer()
      .on_click(() => {
        setShared("regent.sel", session.address);
        if (session.pane) run("pane.focus", { pane: session.pane });
        openPanel(session.status === "blocked" ? "decision" : "complete", { terminal: session.address, pane: session.pane });
      })
      .on_mouse_down("right", (_event, cx) => {
        cx.stop_propagation();
        closeNote(session);
      })
      .tooltip(`${statusLabel(session.status)}: ${session.name} · Right-click to dismiss`)
      .child(art("ui/medallion.png").absolute().left(0).top(0).w(46).h(64))
      .child(div().absolute().left(8).top(8).size(30).rounded(15).bg(C.paper).flex().items_center().justify_center()
        .child(statusGlyph(session.status, 13)))))
    .when(shown.length > 0, (el) => el.child(div().id("regent-note-count").mt(2).h(22).min_w(26).px(6).rounded(11)
      .border(1).border_color(C.ruleStrong).bg(C.paper).flex().items_center().justify_center().cursor_pointer()
      .tooltip("Right-click to dismiss all")
      .on_mouse_down("right", (_event, cx) => {
        cx.stop_propagation();
        const next = { ...(shared("regent.dismissed") ?? {}) };
        for (const session of shown) next[session.address] = session.status;
        setShared("regent.dismissed", next);
      })
      .child(label(shown.length, 12, INK, FONT.mono).font_semibold())));
}

// ===== map =====

const HEX_SLOTS = [
  [[2, 1], [3, 1], [2, 2], [1, 2], [3, 2]],
  [[6, 1], [7, 1], [6, 2], [7, 2], [8, 1]],
  [[5, 4], [6, 4], [4, 4], [5, 5]],
  [[1, 4], [2, 4], [1, 5], [2, 5]],
  [[9, 3], [10, 3], [9, 4]],
];
const HEX_R = 15;
const HEX_W = Math.sqrt(3) * HEX_R;

function hexPoint(q, rr) {
  return [46 + q * HEX_W + (rr % 2 ? HEX_W / 2 : 0), 80 + rr * HEX_R * 1.5];
}

function hexCell(session, x, y) {
  const color = (ST[session.status] ?? ST.idle).color;
  return div().id(`regent-hex-${session.address}`).absolute().left(x - 11).top(y - 11).w(22).h(22).cursor_pointer()
    .when(session.status === "blocked", (el) => el.loop("opacity", { from: 0.45, to: 1, period: 1400 }))
    .tooltip(`${session.name}, ${statusLabel(session.status)}`)
    .on_click(() => setShared("regent.sel", session.address))
    .child(div().absolute().left(3).top(3).w(16).h(16).rounded(3).bg(color).opacity(0.55))
    .child(art("ui/hex-frame.png").absolute().left(0).top(0).w(22).h(22));
}

export function renderMap(view) {
  const sessions = liveSessions();
  const spaceList = liveSpaces();
  const lens = view.lens ?? "status";
  const strip = view?.strip ?? "";
  const lensButton = (key, text) => div().id(`regent-lens-${key}`).h(24).px(8).flex().items_center().rounded(12)
    .border(1).border_color(lens === key ? GOLD : C.ruleStrong).bg(C.paper2).cursor_pointer()
    .when(lens === key, (el) => el.text_color(GOLD))
    .on_click((_event, cx) => view.setLens(key, cx))
    .child(label(text, 11, lens === key ? GOLD : INK2));
  const marks = [];
  const names = [];
  const nameBoxes = [];
  const NAME_W = 92;
  const picked = selectedSession(sessions);
  const pickedSpace = picked?.space ?? null;
  const ranked = spaceList.map((space) => {
    const inSpace = sessions.filter((session) => session.space === space.id)
      .sort((a, b) => statusRank(a.status) - statusRank(b.status));
    return {
      space,
      inSpace,
      blocked: inSpace.some((session) => session.status === "blocked"),
      done: inSpace.some((session) => session.status === "done"),
      selected: space.id === pickedSpace,
      count: inSpace.length,
    };
  }).sort((a, b) => (b.blocked - a.blocked) || (b.done - a.done) || (b.selected - a.selected) || (b.count - a.count));
  const shown = ranked.slice(0, HEX_SLOTS.length);
  const hidden = ranked.slice(HEX_SLOTS.length);
  shown.forEach((entry, index) => {
    const slots = HEX_SLOTS[index];
    const capacity = slots.length - 1;
    const drawn = entry.inSpace.slice(0, capacity);
    const overflow = entry.inSpace.length - drawn.length;
    slots.forEach((slot, slotIndex) => {
      const [x, y] = hexPoint(slot[0], slot[1]);
      if (slotIndex === 0) {
        const left = x - NAME_W / 2;
        const clashes = (candidate) => nameBoxes.some((box) => Math.abs(box.top - candidate) < 14
          && left < box.right && left + NAME_W > box.left);
        let top = y - 30;
        if (clashes(top)) {
          top = y + 18;
          while (clashes(top)) top += 14;
        }
        nameBoxes.push({ top, left, right: left + NAME_W });
        const text = strip && entry.space.name.startsWith(strip) ? entry.space.name.slice(strip.length) : entry.space.name;
        names.push(h_flex().absolute().left(left).top(top).w(NAME_W).justify_center().gap(2)
          .child(label(text, 10, INK).min_w(0).truncate())
          .when(overflow > 0, (el) => el.child(label(`+${overflow}`, 10, GOLD, FONT.mono).flex_none())));
        marks.push(div().id(`regent-cap-${entry.space.id}`).absolute().left(x - 12).top(y - 12).w(24).h(24).cursor_pointer()
          .tooltip(entry.space.name)
          .on_click(() => {
            const first = entry.inSpace.find((s) => s.status === "blocked" || s.status === "done") ?? entry.inSpace[0];
            if (first) setShared("regent.sel", first.address);
          })
          .child(art(`sigil/${sigilOf(entry.space.id)}.png`).absolute().left(5).top(5).w(14).h(14))
          .child(art("ui/hex-frame.png").absolute().left(0).top(0).w(24).h(24)));
        return;
      }
      const session = drawn[slotIndex - 1];
      if (session) marks.push(hexCell(session, x, y));
    });
  });
  return div().id("regent-map").relative().size_full().flex_none().border_r(1).border_color(LINE)
    .child(hudBackdrop())
    .child(art("art/map.jpg").absolute().left(0).top(-2).w(360).h(240).opacity(0.5))
    .child(h_flex().absolute().left(8).top(8).gap(4)
      .child(lensButton("status", "Status"))
      .child(lensButton("repo", "Repo"))
      .child(lensButton("account", "Account")))
    .children(marks)
    .children(names)
    .when(hidden.length > 0, (el) => el.child(div().id("regent-map-more").absolute().right(8).bottom(6).h(18).px(6)
      .rounded(9).border(1).border_color(C.ruleStrong).bg(C.paper2).flex().items_center()
      .tooltip(hidden.map((entry) => entry.space.name).join(", "))
      .child(label(`+${hidden.length}`, 10, MUTED, FONT.mono))))
    .child(hudRule());
}

// ===== unit =====

function barRow(name, value, total, color) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return v_flex().flex_none().w(108).gap(2)
    .child(h_flex().justify_between().child(label(name, 12, MUTED))
      .child(label(total > 0 ? `${value}/${total}` : "—", 12, INK, FONT.mono).font_semibold()))
    .child(div().relative().flex_none().w(108).h(22)
      .child(art("ui/bar-frame.png").absolute().left(0).top(0).size_full())
      .child(div().absolute().left("6%").top(7).h(8).w(`${Math.round(pct * 88)}%`).rounded(2).bg(color)));
}

function socket(id, glyph, hint, danger, onPress) {
  return div().id(`regent-sock-${id}`).relative().size(46).flex_none().flex().items_center().justify_center()
    .cursor_pointer().tooltip(hint)
    .hover((s) => s.opacity(0.85))
    .when(danger, (el) => el.border(1).border_color(C.error).rounded(23))
    .on_click(onPress)
    .child(art("ui/socket.png").absolute().left(0).top(0).w(46).h(46))
    .child(label(glyph, 17, danger ? C.error : INK2));
}

function planRow(step, index) {
  const state = step.state;
  const number = state === "done" ? "✓" : state === "wait" ? "!" : String(index + 1);
  const color = state === "now" ? INK : state === "wait" ? GOLD : MUTED;
  return h_flex().h(26).flex_none().gap(6).items_center()
    .child(div().flex_none().size(18).rounded(9).border(1).border_color(LINE)
      .flex().items_center().justify_center()
      .child(label(number, 10, color, FONT.mono)))
    .child(div().min_w(0).flex_1().truncate().text_size(14).font_family(FONT.body).text_color(color)
      .when(state === "done", (el) => el.line_through().text_color(MUTED))
      .child(step.label))
    .when(state === "now", (el) => el.child(label("Working", 10, INK2)))
    .when(state === "wait", (el) => el.child(label("Needs approval", 10, GOLD)));
}

function queueRow(item, selectedAddress, compact = false) {
  const on = item.address === selectedAddress;
  const waited = item.statusUpdatedAt ? spanLabel(Date.now() - item.statusUpdatedAt) : "";
  const subtitle = queueSubtitle(item);
  return h_flex().id(`regent-q-${item.address}`).h(28).flex_none().gap(8).items_center().px(6).rounded(4)
    .when(on, (el) => el.bg(C.paper3))
    .hover((s) => s.bg(C.paper2)).cursor_pointer()
    .on_click(() => {
      setShared("regent.sel", item.address);
      if (item.pane) run("pane.focus", { pane: item.pane });
    })
    .child(statusGlyph(item.status, 11))
    .when(compact, (el) => el
      .child(div().min_w(0).flex_1().truncate().text_size(14).font_family(FONT.body).text_color(INK).child(item.name)))
    .when(!compact, (el) => el
      .child(div().flex_none().max_w(260).truncate().text_size(14).font_family(FONT.body).text_color(INK).child(item.name))
      .child(div().min_w(0).flex_1().truncate().text_size(13).font_family(FONT.body).text_color(MUTED)
        .child(subtitle)))
    .child(label(waited, 12, MUTED, FONT.mono).flex_none());
}

function queueRowWide(item, selectedAddress) {
  const on = item.address === selectedAddress;
  const waited = item.statusUpdatedAt ? spanLabel(Date.now() - item.statusUpdatedAt) : "";
  return h_flex().id(`regent-qw-${item.address}`).h(34).flex_none().gap(8).items_center().px(6).rounded(4)
    .when(on, (el) => el.bg(C.paper3))
    .hover((s) => s.bg(C.paper2)).cursor_pointer()
    .on_click(() => {
      setShared("regent.sel", item.address);
      if (item.pane) run("pane.focus", { pane: item.pane });
    })
    .child(hexPortrait(item, 26, 30, 2))
    .child(statusGlyph(item.status, 11))
    .child(div().flex_none().w(230).truncate().text_size(14).font_family(FONT.body).text_color(INK).child(item.name))
    .child(label(waited, 12, MUTED, FONT.mono).flex_none().w(48))
    .child(div().min_w(0).flex_1().truncate().text_size(13).font_family(FONT.body).text_color(MUTED)
      .child(queueSubtitle(item)));
}

function workChip(item, width, selectedAddress) {
  const on = item.address === selectedAddress;
  const since = item.statusUpdatedAt ? spanLabel(Date.now() - item.statusUpdatedAt) : "";
  return h_flex().id(`regent-w-${item.address}`).w(width).h(50).flex_none().items_center().gap(8).px(6).rounded(4)
    .when(on, (el) => el.bg(C.paper3))
    .hover((s) => s.bg(C.paper2)).cursor_pointer()
    .tooltip(`${item.name}, ${statusLabel(item.status)}`)
    .on_click(() => {
      setShared("regent.sel", item.address);
      if (item.pane) run("pane.focus", { pane: item.pane });
    })
    .child(hexPortrait(item, 40, 46, 3))
    .child(v_flex().min_w(0).flex_1().gap(1)
      .child(clipped(item.name, 14, item.status === "working" ? INK : INK2))
      .child(h_flex().items_center().gap(5).min_w(0)
        .child(statusGlyph(item.status, 8))
        .child(clipped(since ? `${item.spaceName} · ${since}` : item.spaceName, 12, MUTED))));
}

export function renderUnit(view) {
  const sessions = liveSessions();
  const session = selectedSession(sessions);
  if (!session) {
    return div().id("regent-unit").relative().size_full().flex_none().overflow_hidden()
      .child(hudBackdrop())
      .child(h_flex().size_full().items_center().justify_center()
        .child(label("No sessions.", 13, MUTED)))
      .child(hudRule());
  }
  const elapsed = session.statusUpdatedAt ? spanLabel(Date.now() - session.statusUpdatedAt) : "—";
  const planTotal = session.plan.length;
  const planDone = session.planDone;
  const queue = queueOf(sessions);
  const nBlocked = queue.filter((item) => item.status === "blocked").length;
  const nDone = queue.filter((item) => item.status === "done").length;
  const closeArmed = view.armedClose === session.address;
  const focus = () => { if (session.pane) run("pane.focus", { pane: session.pane }); };
  const W = view?.size?.width ?? 0;
  const mapW = (shared("regent.size.map") ?? [0])[0] || 0;
  const dialW = (shared("regent.size.dial") ?? [0])[0] || 0;
  const axis = W > 0 && mapW > 0 && dialW > 0 ? (mapW + W + dialW) / 2 - mapW : W / 2;
  const cols = unitColumns(W, axis);
  const wide = cols.mode !== "narrow";
  const info = (el) => el
    .child(h_flex().items_center().gap(8).min_w(0)
      .child(div().min_w(0).truncate().text_size(W > 0 && W < 1100 ? 22 : 26).font_family(FONT.display).font_bold().text_color(INK)
        .child(session.name)))
    .child(h_flex().items_center().gap(6).min_w(0).overflow_hidden()
      .child(art(`sigil/${sigilOf(session.space)}.png`).flex_none().w(16).h(16))
      .child(clipped(session.spaceName, 13, INK2))
      .child(label("·", 13, MUTED))
      .child(clipped(session.branch ?? session.tabName, 13, INK2))
      .child(label("·", 13, MUTED))
      .child(label(session.program?.name ?? session.address, 13, INK2))
      .child(label("·", 13, MUTED))
      .child(label(elapsed, 13, MUTED, FONT.mono)))
    .child(h_flex().items_center().gap(6).min_w(0)
      .child(statusGlyph(session.status, 11))
      .child(label(statusLabel(session.status), 13, session.status === "blocked" ? GOLD : INK2))
      .child(div().min_w(0).truncate().text_size(13).font_family(FONT.body).text_color(INK2)
        .child(statusDetail(session))))
    .when(planTotal > 0 || session.context !== null, (el2) => el2.child(h_flex().gap(12).mt(2)
      .when(planTotal > 0, (bar) => bar.child(barRow("Checklist", planDone, planTotal, C.working)))
      .when(session.context !== null, (bar) => bar.child(barRow("Context", session.context, 100,
        session.context > 70 ? GOLD : INK2)))))
    .child(h_flex().gap(6).mt(2)
      .child(socket("focus", "◎", "Go to terminal ↵", false, focus))
      .child(socket("split", "◫", "Open beside ⌘D", false, () => {
        if (session.pane) run("pane.focus", { pane: session.pane });
        run("pane.split", { direction: "right", pane: session.pane });
      }))
      .child(socket("decree", "✦", "Send decree e", false, () => openPanel("decree", { terminal: session.address })))
      .child(socket("rename", "✎", "Rename F2", false, () => run("tab.rename", { id: session.tab })))
      .child(socket("park", "☾", "Rest z", false, () => run("terminal.park", { terminal: session.address })))
      .child(socket("close", closeArmed ? "!" : "✕", closeArmed ? "Press again to end" : "End session ⌫", closeArmed,
        (_event, cx) => view.armClose(session.address, cx))));
  if (!wide) {
    const sideW = sideWidth(W);
    return div().id("regent-unit").relative().size_full().flex_none().overflow_hidden()
      .child(hudBackdrop())
      .child(h_flex().size_full().items_center().gap(20).px(20).py(6)
        .child(hexPortrait(session, 160, 184))
        .child(info(v_flex().flex_1().min_w(0).gap(5).justify_center()))
        .child(v_flex().flex_none().w(sideW).h_full().border_l(1).border_color(LINE).pl(16).py(4).gap(2)
          .when(planTotal > 0, (el) => el
            .child(h_flex().justify_between().items_center().pb(2)
              .child(label("Plan", 16, INK, FONT.display).font_bold())
              .child(label(`${planTotal - planDone} steps left`, 12, MUTED)))
            .children(session.plan.slice(0, 6).map((step, index) => planRow(step, index))))
          .when(planTotal === 0, (el) => el
            .child(h_flex().justify_between().items_center().pb(2)
              .child(label("Queue", 16, INK, FONT.display).font_bold())
              .child(label(`${nBlocked} decisions · ${nDone} reports`, 12, MUTED)))
            .when(queue.length === 0, (row) => row.child(label("No one is waiting.", 12, MUTED)))
            .children(queue.slice(0, 6).map((item) => queueRow(item, session.address, sideW < 400))))))
      .child(hudRule())
      .child(div().absolute().left(0).top(0).w_full().h(20).flex().justify_center()
        .child(art("ui/divider.png").w(120).h(20)));
  }
  const roster = rosterOf(sessions);
  const grid = chipGrid(cols.mid - 48, chipMinWidth(roster.map((item) => item.name)));
  const nWorking = roster.filter((item) => item.status === "working").length;
  const nIdle = roster.length - nWorking;
  const slots = rosterSlots(roster, grid.capacity);
  return div().id("regent-unit").relative().size_full().flex_none().overflow_hidden()
    .child(hudBackdrop())
    .child(h_flex().size_full().items_stretch()
      .child(h_flex().flex_none().w(cols.left).h_full().items_center().gap(20).pl(24).pr(20)
        .child(hexPortrait(session, 160, 184))
        .child(info(v_flex().flex_1().min_w(0).gap(5).justify_center())))
      .child(v_flex().flex_none().w(cols.mid).h_full().border_l(1).border_color(LINE).px(20).pt(26).gap(8)
        .when(planTotal > 0, (el) => el
          .child(h_flex().justify_center().items_center().gap(10)
            .child(label("Plan", 16, INK, FONT.display).font_bold())
            .child(label(`${planTotal - planDone} steps left`, 12, MUTED)))
          .child(v_flex().w_full().max_w(720).mx_auto()
            .children(session.plan.slice(0, 6).map((step, index) => planRow(step, index)))))
        .when(planTotal === 0, (el) => el
          .child(h_flex().justify_center().items_center().gap(10)
            .child(label("Working", 16, INK, FONT.display).font_bold())
            .child(label(String(nWorking), 13, MUTED, FONT.mono))
            .when(nIdle > 0, (row) => row
              .child(label("·", 13, MUTED))
              .child(label("Resting", 14, INK2, FONT.display))
              .child(label(String(nIdle), 13, MUTED, FONT.mono))))
          .when(roster.length === 0, (row) => row.child(h_flex().justify_center()
            .child(label("No one is working.", 12, MUTED))))
          .when(roster.length > 0, (row) => row.child(h_flex().w_full().flex_wrap().justify_center().gap(8)
            .children(slots.shown.map((item) => workChip(item, grid.chipW, session.address)))
            .when(slots.more > 0, (el2) => el2.child(div().id("regent-w-more").w(grid.chipW).h(50).flex_none()
              .flex().items_center().justify_center().rounded(4).border(1).border_color(LINE)
              .tooltip(`${slots.more} more sessions`)
              .child(label(`+${slots.more}`, 14, MUTED, FONT.mono))))))))
      .child(v_flex().flex_none().w(cols.right).h_full().border_l(1).border_color(LINE).px(20).pt(14).gap(2)
        .child(h_flex().justify_between().items_center().pb(4)
          .child(label("Queue", 16, INK, FONT.display).font_bold())
          .child(label(queue.length > 5 ? `${nBlocked} decisions · ${nDone} reports · top 5 shown` : `${nBlocked} decisions · ${nDone} reports`, 12, MUTED)))
        .when(queue.length === 0, (el) => el.child(label("No one is waiting.", 12, MUTED)))
        .when(queue.length > 0, (el) => el.children(queue.slice(0, 5).map((item) => queueRowWide(item, session.address))))))
    .child(hudRule())
    .child(div().absolute().left(cols.left + cols.mid / 2 - 90).top(0).w(180).h(30)
      .child(art("ui/divider.png").size_full()));
}

// ===== dial =====

export function renderDial() {
  const sessions = liveSessions();
  const counts = countsOf(sessions);
  const queue = actionQueue(sessions, shared("regent.dismissed") ?? {});
  const selected = selectedSession(sessions);
  const current = queue.findIndex((session) => session.address === selected?.address);
  const next = queue.length ? queue[(current + 1 + queue.length) % queue.length] : null;
  const blocked = counts.blocked ?? 0;
  const done = counts.done ?? 0;
  const mode = blocked ? "blocked" : done ? "done" : "clear";
  const what = blocked ? "Give orders" : done ? "Read reports" : "All at work";
  const big = mode === "clear" ? "Calm" : String(blocked || done);
  const sat = (role, glyph, hint, top) => div().id(`regent-sat-${role}`).absolute().right(222).top(top).size(38).rounded(19)
    .border(1).border_color(C.ruleStrong).bg(C.paper2).flex().items_center().justify_center()
    .cursor_pointer().hover((s) => s.border_color(GOLD)).tooltip(hint)
    .on_click(() => openPanel(role))
    .child(label(glyph, 14, INK2));
  return div().id("regent-dial").relative().size_full().flex_none().border_l(1).border_color(LINE)
    .child(hudBackdrop())
    .child(v_flex().absolute().left(16).top(40).w(118).gap(3)
      .child(label(what, 19, GOLD, FONT.display).font_bold())
      .when(Boolean(next), (el) => el
        .child(h_flex().items_center().gap(5).min_w(0)
          .child(statusGlyph(next.status, 10))
          .child(div().min_w(0).flex_1().child(clipped(next.name, 15, INK))))
        .child(label("⌘↵ to go", 12, MUTED)))
      .when(!next, (el) => el.child(label("No one is waiting", 12, MUTED))))
    .child(sat("find", "⌕", "Find ⌘K", 46))
    .child(sat("found", "＋", "New session ⌘T", 98))
    .child(sat("report", "☰", "Report ⌘R", 150))
    .child(div().id("regent-dial-core").absolute().right(18).top(20).w(196).h(196).cursor_pointer()
      .tooltip(`${what} ${blocked || done}, go to next session ⌘↵`)
      .on_click(() => nextAction())
      .child(art("ui/dial-bezel.png").absolute().left(0).top(0).w(196).h(196))
      .child(div().absolute().left(37).top(37).w(122).h(122).rounded(61).overflow_hidden()
        .child(window.paint_path(circlePath(122), Background.linear_gradient(160, C.paper3, C.void)).absolute().left(0).top(0).size_full())
        .flex().flex_col().items_center().justify_center()
        .child(label(big, mode === "clear" ? 20 : 48, mode === "clear" ? INK2 : mode === "done" ? C.done : GOLD, FONT.display).font_bold())
        .child(label("⌘↵", 11, MUTED, FONT.mono))))
    .child(hudRule());
}

// The next decision (else report) after the current one, wrapping around.
export function nextAction() {
  const sessions = liveSessions();
  const queue = actionQueue(sessions, shared("regent.dismissed") ?? {});
  if (!queue.length) return;
  const selected = selectedSession(sessions);
  const at = queue.findIndex((session) => session.address === selected?.address);
  const next = queue[(at + 1 + queue.length) % queue.length];
  const panel = shared("regent.panel");
  if (panel) {
    try { closeOverlay(panel); } catch {}
    setShared("regent.panel", null);
  }
  setShared("regent.sel", next.address);
  if (next.pane) run("pane.focus", { pane: next.pane });
  if (next.status === "blocked") openPanel("decision", { terminal: next.address, pane: next.pane });
}

export function openPanel(role, extra = {}) {
  const size = role === "report" || role === "help" || role === "find" ? WIDE : DIALOG;
  const id = openOverlay({
    mod: "regent",
    props: { role, ...extra },
    kind: "dialog",
    frame: "none",
    modal: false,
    width: size.width,
    height: size.height,
  });
  setShared("regent.panel", id);
  return id;
}
