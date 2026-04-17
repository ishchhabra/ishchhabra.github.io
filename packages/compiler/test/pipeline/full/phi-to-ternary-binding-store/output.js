function $0_0($1_0) {
  let $2_0 = $1_0;
  for (const $8_0 of [1, 2]) {
    if ($8_0) {
      const { x: $11_0, ...$12_0 } = $2_0;
      $2_0 = $12_0;
    } else {
      $2_0 = $1_0;
    }
  }
  return $2_0;
}
export { $0_0 as f };
