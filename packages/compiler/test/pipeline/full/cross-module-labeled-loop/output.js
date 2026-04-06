import { create } from "./helper.js";
const k = create(console.log);
export const f = function f(a) {
  if (a) {
    k(a);
  }
};
