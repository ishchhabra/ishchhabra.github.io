const a = function* a() {
  yield 1;
  yield 2;
};
const b = function* b() {
  yield* a();
  yield 3;
};
