function $0($2, $3, $4) {
  let $11;
  if ($3 > 0) {
    $11 = $4;
  } else {
    $11 = $3;
  }
  return $2.substring(0, $11);
}
function $1($16, $17) {
  let $23;
  if ($17 > 0) {
    $23 = "a";
  } else {
    $23 = "b";
  }
  return $16.method($23);
}
export { $0 as substringWithTernary };
export { $1 as methodCallWithConditional };
