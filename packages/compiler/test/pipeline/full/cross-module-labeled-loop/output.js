import { create } from "./helper.js";
const j = create(console.log);
export const f = function f(a) {
  if (a) {
    j(a);
  }
};
