import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

const BACKDROP = "#0d1013";
const PANE = "#060709";
const EDGE = "#453c2b";
const INK = "#c9c4b8";
const DIM = "#7d7868";
const ACCENT = "#dbb970";
const GREEN = "#8fbf8f";
const BLUE = "#8fb0d9";
const MONO = "JetBrains Mono";

const span = ([text, color]) => div().font_family(MONO).text_size(14).line_height("20px").text_color(color).child(text);

const line = (parts) => h_flex().h(20).flex_none().items_start().whitespace_nowrap().children(parts.map(span));

const blank = () => div().h(20).flex_none();

const decisionBox = (lines) => v_flex().flex_none().border(1).border_color(ACCENT).p(10).children(lines);

const LEFT = [
  ["> Check the migration state and apply it on staging", DIM],
  null,
  [["● ", ACCENT], ["The limiter reads its limits from the plans table.", INK]],
  ["  Migration 0042_add_rate_limit_index.sql is not applied", INK],
  ["  on staging yet.", INK],
  ["  └ Read migrations/0042_add_rate_limit_index.sql (38 lines)", DIM],
  null,
];

const DECISION = [
  ["Waiting for a decision", ACCENT],
  ['Run psql "$STAGING_DB" -f migrations/0042_add_rate_limit_index.sql ?', INK],
  ["The index is built CONCURRENTLY, so no table lock. About 2 minutes.", INK],
  null,
  ["❯ 1. Yes", ACCENT],
  ["  2. Yes, and don't ask again", INK],
  ["  3. No", INK],
];

const RIGHT = [
  [["$ ", DIM], ["k6 run scripts/rate-limit.js", INK]],
  null,
  ["  scenarios: 1 scenario, 200 max VUs, 2m30s max duration", DIM],
  null,
  [["  ✓ ", GREEN], ["status is 200 or 429", INK]],
  [["  ✓ ", GREEN], ["retry-after header present", INK]],
  null,
  ["  http_req_duration....: avg=41ms  p(95)=118ms", INK],
  ["  http_reqs............: 48211   321/s", INK],
  ["  iterations...........: 48211   321/s", INK],
  null,
  [["● ", BLUE], ["p95 stays under the 150 ms budget at 200 VUs.", INK]],
  ["  Raising to 400 next.", INK],
];

const rowOf = (entry) => (entry === null ? blank() : line(Array.isArray(entry[0]) ? entry : [entry]));

const pane = (children) => v_flex().h_full().min_w(0).bg(PANE).border(1).border_color(EDGE)
  .px(14).py(12).children(children);

export default class DemoTerm extends View {
  render(_cx) {
    return h_flex().size_full().bg(BACKDROP).p(6).gap(6).items_stretch()
      .child(pane([
        ...LEFT.map(rowOf),
        decisionBox(DECISION.map(rowOf)),
      ]).w("58%"))
      .child(pane(RIGHT.map(rowOf)).flex_1());
  }
}
