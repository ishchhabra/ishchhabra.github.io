function $0($3) {
  if ($3 === 0) {
    return true;
  }
  return $1($3 - 1);
}
function $1($15) {
  if ($15 === 0) {
    return false;
  }
  return $0($15 - 1);
}
$0(4);
