function $0($2, $3, $4) {
  let $11;
  if ($3 > 0) {
    $11 = $4;
  } else {
    $11 = $3;
  }
  return $2.substring(0, $11);
}
function $1($15, $16) {
  return $15.method($16 > 0 ? "a" : "b");
}
export { $0 as substringWithTernary };
export { $1 as methodCallWithConditional };
