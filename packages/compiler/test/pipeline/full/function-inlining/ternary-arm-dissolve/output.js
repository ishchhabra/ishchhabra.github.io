function $0({ x: $2, ...$3 }) {
  return $3;
}
function $1($8) {
  const $30 = $8;
  for (const $15 of [1, 2]) {
    if ($15) {
      $0($30);
    }
    continue;
  }
  return $30;
}
export { $1 as f };
