function $0_0($1_0) {
  let $2_0 = 0;
  let $20_blockparam_20 = undefined;
  $20_blockparam_20 = $2_0;
  let $21_blockparam_21 = undefined;
  for (const $6_0 of $1_0) {
    $2_0 = $20_blockparam_20 + $6_0;
    $20_blockparam_20 = $2_0;
    $21_blockparam_21 = $2_0;
  }
  return $21_blockparam_21;
}
console.log($0_0(numbers));
