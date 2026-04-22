function $0($1) {
  let blockparam_22 = undefined;
  do {
    const $28 = $1.flags;
    if (!($28 & 36)) {
      $1.flags = $28 | 32;
      blockparam_22 = $28;
    } else {
      blockparam_22 = 0;
    }
    return blockparam_22;
  } while (true);
}
