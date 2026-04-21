function $0($1, $2, $3) {
  let $30 = undefined;
  if ($1) {
    let $20 = undefined;
    let blockparam_45 = undefined;
    let blockparam_46 = undefined;
    if ($2) {
      $20 = $2;
      blockparam_45 = $2;
      blockparam_46 = undefined;
    } else {
      $20 = $3;
      blockparam_45 = undefined;
      blockparam_46 = $3;
    }
    const $63 =
      ($20,
      {
        x: blockparam_45,
        y: blockparam_46,
      });
    $30 = $63;
  } else {
    const $65 = {};
    $30 = $65;
  }
  return $30;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
