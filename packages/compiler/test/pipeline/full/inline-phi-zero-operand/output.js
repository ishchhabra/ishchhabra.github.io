function $0($1, $2, $3) {
  let $15 = undefined;
  let $17 = undefined;
  let blockparam_43 = undefined;
  let blockparam_45 = undefined;
  if ($1) {
    if ($2) {
      $17 = $2;
      blockparam_43 = $2;
      blockparam_45 = undefined;
    } else {
      $17 = $3;
      blockparam_43 = undefined;
      blockparam_45 = $3;
    }
    const $65 =
      ($17,
      {
        x: blockparam_43,
        y: blockparam_45,
      });
    $15 = $65;
  } else {
    const $63 = {};
    $15 = $63;
  }
  return $15;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
