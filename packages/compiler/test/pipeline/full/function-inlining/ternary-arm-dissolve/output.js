function $0({ x: $2, ...$3 }) {
  return $3;
}
function $1($6) {
  let $27;
  let $28 = $6;
  for (const $13 of [1, 2]) {
    if ($13) {
      $27 = $0($28);
    } else {
      $27 = $6;
    }
    $28 = $27;
    continue;
  }
  return $28;
}
export { $1 as f };
