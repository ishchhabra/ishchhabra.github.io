function $1_0($2_0) {
  if ($2_0 === 0) {
    return true;
  }
  return isOdd($2_0 - 1);
}
function $10_0($11_0) {
  if ($11_0 === 0) {
    return false;
  }
  return $1_0($11_0 - 1);
}
const $0_0 = $1_0(4);
