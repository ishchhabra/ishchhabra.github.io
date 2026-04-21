function $0($1) {
  const $6 = undefined;
  let blockparam_20 = undefined;
  blockparam_20 = 0;
  let blockparam_21 = undefined;
  for (const $6 of $1) {
    const $30 = blockparam_20 + $6;
    blockparam_20 = $30;
  }
  return blockparam_21;
}
console.log($0(numbers));
