function $0($1) {
  const $22 = $1;
  let $19 = 1;
  for (const $6 of $1) {
    $19 = $6 * $19;
    continue;
  }
  return $19;
}
console.log($0(numbers));
