function $0($1, $2, $3) {
  let $17;
  let $19;
  let $46;
  let $48;
  if ($1) {
    if ($2) {
      $19 = $2;
      $46 = $2;
      $48 = undefined;
    } else {
      $19 = $3;
      $46 = undefined;
      $48 = $3;
    }
    const $64 =
      ($19,
      {
        x: $46,
        y: $48,
      });
    $17 = $64;
  } else {
    const $62 = {};
    $17 = $62;
  }
  return $17;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
