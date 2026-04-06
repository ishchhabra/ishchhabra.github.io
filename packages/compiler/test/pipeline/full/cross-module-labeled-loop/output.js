import { create } from "./helper.js";
const i = create(console.log);
export const f = function f(a) {
  if (a) {
    i(a);
  }
};
