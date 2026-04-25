function $0($1, $2, $3) {
  let $15;
  let $17;
  let $43;
  let $45;
  if ($1) {
    if ($2) {
      $17 = $2;
      $43 = $2;
      $45 = undefined;
    } else {
      $17 = $3;
      $43 = undefined;
      $45 = $3;
    }
    const $56 =
      ($17,
      {
        x: $43,
        y: $45,
      });
    $15 = $56;
  } else {
    const $55 = {};
    $15 = $55;
  }
  return $15;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
