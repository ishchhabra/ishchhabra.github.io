function* $0() {
  yield 1;
  yield 2;
}
function* $1() {
  yield* $0();
  yield 3;
}
