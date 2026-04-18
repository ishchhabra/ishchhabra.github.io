function $0($1) {
  let $2 = 0;
  let blockparam_20 = undefined;
  blockparam_20 = $2;
  let blockparam_21 = undefined;
  for (const $6 of $1) {
    $2 = blockparam_20 + $6;
    blockparam_20 = $2;
    blockparam_21 = $2;
  }
  return blockparam_21;
}
console.log($0(numbers));
