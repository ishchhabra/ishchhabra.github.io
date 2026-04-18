function $0($3) {
  function $4($5) {
    return $5 && $5.position && $5.position[$3];
  }
  return $4;
}
const $1 = $0("end");
export { $1 as pointEnd };
const $2 = $0("start");
export { $2 as pointStart };
