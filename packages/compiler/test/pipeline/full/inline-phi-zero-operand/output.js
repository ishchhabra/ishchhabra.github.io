function $0($1, $2, $3) {
  let $11;
  let $13;
  let $39;
  let $41;
  if ($1) {
    if ($2) {
      $13 = $2;
      $39 = $2;
      $41 = undefined;
    } else {
      $13 = $3;
      $39 = undefined;
      $41 = $3;
    }
    $11 =
      ($13,
      {
        x: $39,
        y: $41,
      });
  } else {
    $11 = {};
  }
  return $11;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
