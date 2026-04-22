function $0($2, $3, $4) {
  let $11 = undefined;
  if ($3 > 0) {
    $11 = $4;
  } else {
    $11 = $3;
  }
  return $2.substring(0, $11);
}
function $1($15, $16) {
  let $22 = undefined;
  if ($16 > 0) {
    $22 = "a";
  } else {
    $22 = "b";
  }
  return $15.method($22);
}
export { $0 as substringWithTernary };
export { $1 as methodCallWithConditional };
