// gpui-base stub: layout elements reuse the gpui-kit builder; field states
// keep their value and record focus() into the shared log.
import { makeElement } from "./gpui-kit.mjs";
import { focusLog } from "./log.mjs";

export const h_flex = () => makeElement("h_flex");
export const v_flex = () => makeElement("v_flex");

class FieldState {
  constructor(kind) {
    this.kind = kind;
    this.current = "";
    this.handlers = {};
  }

  value() {
    return this.current;
  }

  set_value(value) {
    this.current = value;
  }

  on(event, fn) {
    (this.handlers[event] ??= []).push(fn);
  }

  focus() {
    focusLog.push(["focus", this.kind]);
  }
}

export const InputState = { new: () => new FieldState("input") };
export const TextareaState = { new: () => new FieldState("textarea") };

export const Input = { new: () => makeElement("input") };
export const Textarea = { new: () => makeElement("textarea") };
