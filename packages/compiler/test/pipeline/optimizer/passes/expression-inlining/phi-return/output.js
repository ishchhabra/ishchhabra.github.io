function $0($1, $2, $3) {
  let $4 = undefined;
  let $25 = undefined;
  if ($1) {
    $4 = $2;
    $25 = $4;
  } else {
    $4 = $3;
    $25 = $4;
  }
  return $25;
}
console.log($0(true, 1, 2));
