let notifyIndex = globalThis.i;
let queuedLength = globalThis.n;
const queued = globalThis.queued;

export function flush() {
  while (notifyIndex < queuedLength) {
    const effect = queued[notifyIndex];
    queued[notifyIndex++] = undefined;
    globalThis.run(effect);
  }
}
