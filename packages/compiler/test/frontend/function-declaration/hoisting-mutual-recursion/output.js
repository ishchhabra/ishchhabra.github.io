function $0_0($3_0) {
  if ($3_0 === 0) {
    return true;
  }
  return $1_0($3_0 - 1);
}
function $1_0($10_0) {
  if ($10_0 === 0) {
    return false;
  }
  return $0_0($10_0 - 1);
}
const $2_0 = $0_0(4);
