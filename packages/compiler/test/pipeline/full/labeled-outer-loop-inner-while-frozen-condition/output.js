function $0($1) {
  $1.nextSub;
  if ($1.flags & 1) {
    const $13 = $1.sub;
    if ($13 !== undefined) {
      $1 = $13;
      const $20 = $13.nextSub;
      if ($20 !== undefined) {
        $3 = {
          value: $2,
          prev: $3,
        };
        $2 = $20;
      }
      continue;
    }
  }
  $1 = $2;
  if ($2 !== undefined) {
    $2 = $2.nextSub;
    continue;
  }
  while ($3 !== undefined) {
    $1 = $3.value;
    $3 = $3.prev;
    if ($1 !== undefined) {
      $2 = $1.nextSub;
      continue top;
    }
    continue;
  }
  break;
}
