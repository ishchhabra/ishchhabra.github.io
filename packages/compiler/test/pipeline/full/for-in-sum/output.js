function $0($1) {
  const $22 = $1;
  let $19;
  $19 = 0;
  for (const $6 in $22) {
    const $23 = $19 + 1;
    $19 = $23;
    continue;
  }
  return $19;
}
console.log($0(myObj));
