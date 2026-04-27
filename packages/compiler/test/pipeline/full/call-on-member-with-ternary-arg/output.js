function $0($2, $3, $4) {
  return $2.substring(0, $3 > 0 ? $4 : $3);
}
function $1($15, $16) {
  return $15.method($16 > 0 ? "a" : "b");
}
export { $0 as substringWithTernary };
export { $1 as methodCallWithConditional };
