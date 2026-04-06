import { create } from "./helper.js";
const c = create(console.log);
export const f = function f(a) {
  if (a) {
    c(a);
  }
};
