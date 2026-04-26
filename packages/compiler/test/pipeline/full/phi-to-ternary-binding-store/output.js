function $0($1) {
  let $22;
  let $23;
  $23 = $1;
  for (const $8 of [1, 2]) {
    if ($8) {
      const { x: $10, ...$11 } = $23;
      $22 = $11;
    } else {
      $22 = $1;
    }
    $23 = $22;
    continue;
  }
  return $23;
}
export { $0 as f };
