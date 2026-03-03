/**
 * Empty shim used so the worker bundle doesn’t pull in @react-refresh (which
 * references `window` and breaks in Worker scope). Replace in Vite only for
 * worker entry.
 */
export default function noop() {}
