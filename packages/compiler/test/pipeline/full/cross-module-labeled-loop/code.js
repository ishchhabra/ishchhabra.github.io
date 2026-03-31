import { create } from "./helper.js";
const run = create(console.log);
export function f(x) {
  if (x) run(x);
}
