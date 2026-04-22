function $0($1) {
  let $2 = $1.flags;
  if (!($2 & 36)) {
    $1.flags = $2 | 32;
    return $2;
  } else {
    $2 = 0;
    return $2;
  }
}
