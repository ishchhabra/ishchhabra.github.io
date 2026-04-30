function $0($1) {
  const $22 = $1;
  let $19 = 0;
  for (const $6 in $1) {
    $19++;
    continue;
  }
  return $19;
}
console.log($0(myObj));
