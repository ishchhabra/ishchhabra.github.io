function $0($1) {
  const $70 = $1.nextSub;
  let blockparam_64 = undefined;
  top: do {
    if ($1.flags & 1) {
      const $72 = $1.sub;
      if ($72 !== undefined) {
        if ($72.nextSub !== undefined) {
        }
        continue;
      }
    }
    if ($70 !== undefined) {
      $70.nextSub;
      continue;
    }
    blockparam_64 = undefined;
    while (blockparam_64 !== undefined) {
      const $74 = blockparam_64.value;
      const $76 = blockparam_64.prev;
      if ($74 !== undefined) {
        $74.nextSub;
        continue top;
      }
      blockparam_64 = $76;
      continue;
    }
    break;
  } while (true);
}
