function $0_0($1_0) {
  while (true) {
    let $3_0 = $1_0.flags;
    let $24_0 = undefined;
    if (!($3_0 & (4 | 32))) {
      $1_0.flags = $3_0 | 32;
      $24_0 = $3_0;
    } else {
      $3_0 = 0;
      $24_0 = $3_0;
    }
    if (!true) {
      break;
    }
    return $24_0;
  }
}
