function $0() {
  return this.value;
}
console.log(
  {
    value: 1,
    m: $0,
  }.m(),
);
