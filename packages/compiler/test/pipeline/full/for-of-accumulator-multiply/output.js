function $0($1) {
  let blockparam_20 = undefined;
  blockparam_20 = 1;
  let blockparam_21 = undefined;
  for (const $6 of $1) {
    const $29 = $6 * blockparam_20;
    blockparam_20 = $29;
    blockparam_21 = $29;
  }
  return blockparam_21;
}
console.log($0(numbers));
