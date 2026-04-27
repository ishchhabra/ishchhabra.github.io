function $0($1) {
  const $22 = $1;
  let $19;
  $19 = 0;
  for (const $6 of $22) {
    $19 = $19 + $6;
    continue;
  }
  return $19;
}
console.log($0(numbers));
