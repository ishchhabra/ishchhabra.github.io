function $0() {
  return "b";
}
function $1() {
  return 3;
}
({
  b: 1,
})[$0()] += $1();
