function $0($1) {
  while (true) {
    let $3 = $1.flags;
    let $24 = undefined;
    if (!($3 & (4 | 32))) {
      $1.flags = $3 | 32;
      $24 = $3;
    } else {
      $3 = 0;
      $24 = $3;
    }
    if (!true) {
      break;
    }
    return $24;
  }
}
