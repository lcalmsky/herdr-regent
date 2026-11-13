// Regent: a strategy-game HUD around the terminals. The layout gives each
// block a role; the bar copy is the only one that polls data and answers keys.
import { View } from "gpui-kit";
import { InputState, TextareaState } from "gpui-base";
import {
  appHome, closeOverlay, exec, hc, nextCommand, notify, props, run, setAgentOrder, setShared, shared,
} from "herdr";
import { liveAgents, liveData, liveSpaces } from "./source.js";
import {
  buildSessions, orderAddresses, pairScan, parseChoices, parseScanStdout, parseUsage, planOf, spanLabel, statusRank, tailLines,
} from "./data.js";
import {
  liveSessions, nextAction, openPanel, renderBar, renderDial, renderMap, renderNotes, renderRibbon, renderTabs, renderUnit, selectedSession,
} from "./views.js";
import {
  renderComplete, renderDecree, renderDecision, renderFind, renderFound, renderHelp, renderReport,
} from "./overlays.js";

const POLL_MS = 3000;
const USAGE_MS = 30000;
const FOCUS_WATCH_MS = 250;
const CLOCK_MS = 20000;
const OVERLAY_ROLES = ["decision", "complete", "found", "decree", "find", "report", "help"];

export default class Regent extends View {
  init(_given, cx) {
    this.role = props()?.role ?? "bar";
    if (OVERLAY_ROLES.includes(this.role)) {
      this.initOverlay(cx);
      return;
    }
    this.size = { width: 0, height: 0 };
    if (this.role === "bar") {
      this.handle = cx.focus_handle();
      this.scanning = false;
      this.scanErrors = 0;
      this.scanByAddress = {};
      this.usage = null;
      this.published = null;
      this.agentOrder = null;
      this.retrySeen = shared("regent.retry") ?? null;
      cx.spawn(async (cx) => {
        for (;;) {
          const command = await nextCommand();
          this.command(command, cx);
        }
      });
      cx.timer.every(POLL_MS, (cx) => {
        const retry = shared("regent.retry") ?? null;
        if (retry !== this.retrySeen) {
          this.retrySeen = retry;
          this.scanErrors = 0;
          this.pollScan(cx);
          return;
        }
        this.pollScan(cx);
      });
      cx.timer.every(USAGE_MS, (cx) => this.pollUsage(cx));
      cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
      this.pollScan(cx);
      this.pollUsage(cx);
      return;
    }
    if (this.role === "ribbon") {
      cx.timer.every(CLOCK_MS, (cx) => cx.notify());
      return;
    }
    if (this.role === "map") {
      this.lens = "status";
      this.strip = String(props()?.strip ?? "");
    }
    if (this.role === "unit") this.armedClose = null;
  }

  // The bar is the only copy with the command loop; pane.go's "focus" lands here too.
  command(name, cx) {
    if (name === "focus") {
      this.handle?.focus();
      cx.notify();
      return;
    }
    if (name === "toggle") {
      if (this.handle?.is_focused()) run("pane.go", { direction: "down" });
      else this.handle?.focus();
      cx.notify();
      return;
    }
    if (name === "next") nextAction();
    else if (name === "read_all") this.readAll();
    else if (name === "retry") {
      this.scanErrors = 0;
      this.pollScan(cx);
    } else if (name.startsWith("filter_")) {
      const status = name.slice("filter_".length);
      setShared("regent.filter", shared("regent.filter") === status ? null : status);
    } else if (["find", "found", "decree", "report", "help"].includes(name)) {
      openPanel(name);
    }
    cx.notify();
  }

  readAll() {
    const dismissed = { ...(shared("regent.dismissed") ?? {}) };
    for (const session of liveSessions()) if (session.status === "done") dismissed[session.address] = "done";
    setShared("regent.dismissed", dismissed);
  }

  watchFocus(cx) {
    const on = Boolean(this.handle?.is_focused());
    if (on === this.focusedDrawn) return;
    this.focusedDrawn = on;
    cx.notify();
  }

  pollScan(cx) {
    if (this.scanning) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      let rows = null;
      let error = null;
      try {
        const result = await exec("sh", [`${appHome()}/mods/regent/scan.sh`]);
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || "").trim() || `scan.sh exited ${result.code}`);
        rows = parseScanStdout(result.stdout ?? "");
      } catch (error_) {
        error = String(error_?.message ?? error_);
      }
      this.scanning = false;
      this.scanErrors = error ? this.scanErrors + 1 : 0;
      if (!error) this.scanByAddress = pairScan(rows);
      this.publish();
      cx.notify();
    });
  }

  pollUsage(cx) {
    cx.spawn(async (cx) => {
      try {
        const result = await exec(`${appHome()}/mods/regent/cca`, ["--porcelain"]);
        this.usage = result.code === 0 ? parseUsage(result.stdout) : null;
      } catch {
        this.usage = null;
      }
      this.publish();
      cx.notify();
    });
  }

  // scan.sh's sessions are keyed by the terminal address Herdr's agents carry.
  publish() {
    const list = liveAgents();
    const sessions = {};
    for (const agent of list) {
      const row = this.scanByAddress[agent.address];
      if (!row) continue;
      sessions[agent.address] = {
        plan: planOf(row.deadhd),
        waitingFor: row.waitingFor ?? null,
        startedAt: row.startedAt ?? null,
        statusUpdatedAt: row.statusUpdatedAt ?? null,
        context: null,
      };
    }
    const key = JSON.stringify({ sessions, usage: this.usage, scanErrors: this.scanErrors });
    if (key === this.published) return;
    this.published = key;
    setShared("regent.data", { sessions, usage: this.usage, scanErrors: this.scanErrors, at: Date.now() });
    const addresses = orderAddresses(buildSessions(list, liveSpaces(), { sessions }));
    const orderText = addresses.join("|");
    if (orderText !== this.agentOrder) {
      this.agentOrder = orderText;
      setAgentOrder(addresses);
    }
  }

  // ---- overlay copies ----

  initOverlay(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(60, (later) => this.handle.focus());
    const p = props() ?? {};
    if (this.role === "decision") {
      this.parsed = undefined;
      this.screenTail = [];
      this.waitLabel = "waiting";
      this.loadScreen(cx);
    } else if (this.role === "complete") {
      const extra = liveData()?.sessions?.[p.terminal] ?? null;
      this.planTotal = Array.isArray(extra?.plan) ? extra.plan.length : 0;
      this.summaryText = extra?.waitingFor ?? null;
    } else if (this.role === "found") {
      this.pickSpace = null;
      this.pickAgent = 0;
      this.taskInput = TextareaState.new({ placeholder: "e.g. Check the migration status and apply it to dev", rows: 3 });
    } else if (this.role === "decree") {
      this.picked = new Set(buildSessions(liveAgents(), liveSpaces(), null)
        .filter((session) => session.status === "blocked").map((session) => session.address));
      this.decreeInput = TextareaState.new({ placeholder: "e.g. Summarise what you have done in three lines, then stop", rows: 3 });
    } else if (this.role === "find") {
      this.findAt = 0;
      this.searchInput = InputState.new({ placeholder: "Search sessions, spaces and commands" });
      this.searchInput.on("change", (_event, cx) => {
        this.findAt = 0;
        cx.notify();
      });
      this.searchInput.on("submit", () => this.openFound());
      this.searchInput.focus();
      cx.timer.after(60, () => this.searchInput.focus());
    }
  }

  loadScreen(cx) {
    const terminal = props()?.terminal;
    if (!terminal) {
      this.parsed = null;
      return;
    }
    cx.spawn(async (cx) => {
      let screen = "";
      try {
        const result = await hc(["read", terminal]);
        screen = result.stdout ?? "";
      } catch {}
      const extra = liveData()?.sessions?.[terminal] ?? null;
      if (extra?.statusUpdatedAt) this.waitLabel = `waiting ${spanLabel(Date.now() - extra.statusUpdatedAt)}`;
      this.parsed = parseChoices(screen);
      this.screenTail = tailLines(screen, 12);
      cx.notify();
    });
  }

  overlayKey(event, cx) {
    const key = event.key;
    if (key === "escape") {
      this.close();
      cx.stop_propagation();
      return;
    }
    if (this.role === "decision") {
      if (/^[1-9]$/.test(key) && this.parsed?.choices?.some((choice) => choice.n === Number(key))) {
        this.answer(Number(key), cx);
        cx.stop_propagation();
      } else if (key === "enter") {
        this.focusTerminal();
        cx.stop_propagation();
      }
      return;
    }
    if (this.role === "find") this.findKey(event, cx);
    else if (this.role === "found" && event.keystroke === "cmd-enter") this.createSession();
    else if (this.role === "decree" && event.keystroke === "cmd-enter") this.sendDecree(cx);
  }

  close() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  focusTerminal() {
    const p = props() ?? {};
    if (p.pane) run("pane.focus", { pane: p.pane });
    else if (p.terminal) run("pane.focus", { terminal: p.terminal });
    this.close();
  }

  answer(n, cx) {
    const terminal = props()?.terminal;
    const overlay = props()?.overlay;
    if (!terminal) return;
    cx.spawn(async (cx) => {
      try {
        await hc(["keys", terminal, String(n)]);
      } catch {}
      if (overlay) closeOverlay(overlay);
      cx.notify();
    });
  }

  pickFoundSpace(id, cx) {
    this.pickSpace = id;
    cx.notify();
  }

  pickFoundAgent(index, cx) {
    this.pickAgent = index;
    cx.notify();
  }

  createSession() {
    const spaceList = liveSpaces();
    const space = this.pickSpace ?? spaceList.find((s) => s.active)?.id ?? spaceList[0]?.id ?? null;
    const argv = this.pickAgent === 0 ? ["claude"] : this.pickAgent === 1 ? ["codex"] : this.pickAgent === 2 ? ["gemini"] : null;
    const task = (this.taskInput?.value() ?? "").trim();
    const args = {};
    if (space) args.space = space;
    if (argv) args.argv = argv;
    if (task) args.task = task;
    run("tab.new", args);
    this.close();
  }

  togglePicked(address, cx) {
    if (this.picked.has(address)) this.picked.delete(address);
    else this.picked.add(address);
    cx.notify();
  }

  sendDecree(cx) {
    const text = (this.decreeInput?.value() ?? "").trim();
    if (!text || !this.picked.size) return;
    const targets = [...this.picked];
    const overlay = props()?.overlay;
    cx.spawn(async (cx) => {
      const sessions = buildSessions(liveAgents(), liveSpaces(), null);
      let sent = 0;
      const skipped = [];
      for (const address of targets) {
        const session = sessions.find((candidate) => candidate.address === address);
        if (!session) continue;
        if (session.status === "blocked") {
          skipped.push(session.name);
          continue;
        }
        try {
          const result = await hc(["send", address, text]);
          if (result.code === 0) sent += 1;
        } catch {}
      }
      notify({
        title: "Decree",
        body: `Sent to ${sent}${skipped.length ? ` · skipped, waiting for orders: ${skipped.join(", ")}` : ""}`,
        level: "info",
      });
      if (overlay) closeOverlay(overlay);
      cx.notify();
    });
  }

  findRows() {
    const query = (this.searchInput?.value() ?? "").trim().toLowerCase();
    const sessions = buildSessions(liveAgents(), liveSpaces(), null)
      .filter((session) => !query || session.name.toLowerCase().includes(query) || session.spaceName.toLowerCase().includes(query))
      .sort((a, b) => statusRank(a.status) - statusRank(b.status));
    const commands = [
      ["found", "New session"],
      ["decree", "Send decree"],
      ["report", "Report"],
      ["help", "Shortcuts"],
    ].filter((cmd) => !query || cmd[1].toLowerCase().includes(query));
    return { sessions, commands };
  }

  findKey(event, cx) {
    const { sessions, commands } = this.findRows();
    const total = sessions.length + commands.length;
    if (!total) return;
    if (event.key === "down") this.findAt = (this.findAt + 1) % total;
    else if (event.key === "up") this.findAt = (this.findAt - 1 + total) % total;
    else if (event.key === "enter") {
      this.openFound();
      cx.stop_propagation();
      return;
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  openFound() {
    const { sessions, commands } = this.findRows();
    if (this.findAt < sessions.length) {
      const session = sessions[this.findAt];
      setShared("regent.sel", session.address);
      if (session.pane) run("pane.focus", { pane: session.pane });
      this.close();
    } else if (commands[this.findAt - sessions.length]) {
      const role = commands[this.findAt - sessions.length][0];
      this.close();
      openPanel(role);
    }
  }

  openFind(address) {
    const session = buildSessions(liveAgents(), liveSpaces(), null).find((candidate) => candidate.address === address);
    if (session) {
      setShared("regent.sel", session.address);
      if (session.pane) run("pane.focus", { pane: session.pane });
    }
    this.close();
  }

  openFindCommand(role) {
    this.close();
    openPanel(role);
  }

  setLens(key, cx) {
    this.lens = key;
    cx.notify();
  }

  armClose(address, cx) {
    if (this.armedClose === address) {
      const session = liveSessions().find((candidate) => candidate.address === address);
      if (session?.pane) run("pane.close", { pane: session.pane });
      this.armedClose = null;
    } else {
      this.armedClose = address;
    }
    cx.notify();
  }

  barKey(event, cx) {
    const sessions = liveSessions().slice().sort((a, b) => statusRank(a.status) - statusRank(b.status));
    const selected = selectedSession(sessions);
    let at = sessions.findIndex((session) => session.address === selected?.address);
    if (event.key === "right" || event.key === "left") {
      if (!sessions.length) return;
      at = (at + (event.key === "right" ? 1 : -1) + sessions.length) % sessions.length;
      setShared("regent.sel", sessions[at].address);
    } else if (event.key === "enter") {
      if (selected?.pane) run("pane.focus", { pane: selected.pane });
    } else if (event.key === "e") {
      openPanel("decree", selected ? { terminal: selected.address } : {});
    } else if (event.key === "escape") {
      run("pane.go", { direction: "down" });
    } else {
      return;
    }
    cx.stop_propagation();
    cx.notify();
  }

  sized(root) {
    return root.on_size_change((size, cx) => {
      if (size.width === this.size.width && size.height === this.size.height) return;
      this.size = size;
      const key = `regent.size.${this.role}`;
      const old = shared(key);
      if (!Array.isArray(old) || old[0] !== size.width || old[1] !== size.height) setShared(key, [size.width, size.height]);
      cx.notify();
    });
  }

  render(cx) {
    switch (this.role) {
      case "tabs": return this.sized(renderTabs(cx));
      case "ribbon": return this.sized(renderRibbon(cx));
      case "notes": return this.sized(renderNotes(cx));
      case "map": return this.sized(renderMap(this, cx));
      case "unit": return this.sized(renderUnit(this, cx));
      case "dial": return this.sized(renderDial(cx));
      case "decision": return renderDecision(this, cx);
      case "complete": return renderComplete(this, cx);
      case "found": return renderFound(this, cx);
      case "decree": return renderDecree(this, cx);
      case "find": return renderFind(this, cx);
      case "report": return renderReport(this, cx);
      case "help": return renderHelp(this, cx);
      default:
        return this.sized(renderBar(this))
          .track_focus(this.handle)
          .on_key_down((event, cx) => this.barKey(event, cx))
          .when(Boolean(this.handle?.is_focused()), (el) => el.border_b(2).border_color("#dbb970"));
    }
  }
}
