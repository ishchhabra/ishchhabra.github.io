function* $0_0() {
  yield 1;
  yield 2;
}
function* $1_0() {
  yield* $0_0();
  yield 3;
}
