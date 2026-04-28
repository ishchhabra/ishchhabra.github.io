function $0($1) {
  let $19;
  $19 = 0;
  for (const $6 in $1) {
    $19 += 1;
    continue;
  }
  return $19;
}
console.log($0(myObj));
