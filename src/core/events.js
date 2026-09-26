// Tiny synchronous event bus. Systems talk through named events so gameplay never imports UI/audio directly.
const listeners = new Map();

export function on(name, fn) {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function once(name, fn) {
  const off = on(name, (p) => { off(); fn(p); });
  return off;
}

export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.error(`[event ${name}]`, e); }
  }
}
