const $0_0 = function $0_0($3_0) {
  if ($3_0 === 0) {
    return true;
  }
  return $1_0($3_0 - 1);
};
const $1_0 = function $1_0($11_0) {
  if ($11_0 === 0) {
    return false;
  }
  return $0_0($11_0 - 1);
};
const result = $0_0(4);
