function $0($1) {
  let $23 = $1;
  for (const $8 of [1, 2]) {
    const { x: $10, ...$11 } = $23;
    $23 = $8 ? $11 : $1;
    continue;
  }
  return $23;
}
export { $0 as f };
