// gpui-kit stub: every element is one chainable builder recorded in a WeakMap,
// so tests can walk the rendered tree and fire the handlers the source set.

const records = new WeakMap();

function methodFor(record, name, self) {
  switch (name) {
    case "id": return (value) => { record.id = value; return self; };
    case "child": return (value) => { record.children.push(value); return self; };
    case "children": return (list) => {
      if (Array.isArray(list)) record.children.push(...list);
      return self;
    };
    case "when": return (cond, fn) => {
      if (cond) fn(self);
      return self;
    };
    case "on_click": return (fn) => { record.handlers.click = fn; return self; };
    case "on_key_down": return (fn) => { record.handlers.key_down = fn; return self; };
    case "on_mouse_down": return (button, fn) => {
      record.handlers[`mouse_down_${button}`] = fn;
      return self;
    };
    case "on_size_change": return (fn) => { record.handlers.size_change = fn; return self; };
    default: return () => self;
  }
}

export function makeElement(tag) {
  const record = { tag, id: null, children: [], handlers: {} };
  const target = {};
  let proxy;
  proxy = new Proxy(target, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return methodFor(record, prop, proxy);
    },
  });
  records.set(proxy, record);
  return proxy;
}

export const recordOf = (node) => records.get(node);

export function findById(root, id) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    const record = records.get(node);
    if (!record) continue;
    if (record.id === id) return node;
    for (const child of record.children) {
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

export function div() {
  return makeElement("div");
}

export function image(src) {
  return makeElement(`image:${src}`);
}

function pathBuilder() {
  const builder = {
    move_to: () => builder,
    line_to: () => builder,
    arc_to: () => builder,
    close: () => builder,
    build: () => ({}),
  };
  return builder;
}

export const PathBuilder = {
  fill: () => pathBuilder(),
  stroke: () => pathBuilder(),
};

export const Background = {
  linear_gradient: () => ({}),
};

export class View {}

globalThis.window = { paint_path: () => makeElement("paint_path") };
