function $1_0($3_0) {
  if ($3_0 === 0) {
    return true;
  }
  return $2_0($3_0 - 1);
}
function $2_0($10_0) {
  if ($10_0 === 0) {
    return false;
  }
  return $1_0($10_0 - 1);
}
const $0_0 = $1_0(4);
