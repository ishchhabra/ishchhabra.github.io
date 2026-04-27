function $0($1) {
  const $95 = $1.nextSub;
  let $3;
  let $61;
  let $64;
  let $65;
  let $66;
  let $68;
  let $69;
  let $70;
  let $72;
  let $73;
  $64 = $1;
  $66 = $95;
  $72 = $3;
  top: do {
    if ($64.flags & 1) {
      const $96 = $64.sub;
      if ($96 !== undefined) {
        const $97 = $96.nextSub;
        if ($97 !== undefined) {
          $68 = $97;
          $73 = {
            value: $66,
            prev: $72,
          };
        } else {
          $68 = $66;
          $73 = $72;
        }
        $61 = $96;
        $65 = $68;
        $69 = $73;
        continue;
      }
    }
    if ($66 !== undefined) {
      const $98 = $66.nextSub;
      $61 = $66;
      $65 = $98;
      $69 = $72;
      continue;
    }
    $70 = $72;
    while ($70 !== undefined) {
      const $99 = $70.value;
      const $100 = $70.prev;
      if ($99 !== undefined) {
        const $101 = $99.nextSub;
        $61 = $99;
        $65 = $101;
        $69 = $100;
        continue top;
      }
      $70 = $100;
      continue;
    }
    break;
  } while ((($64 = $61), ($66 = $65), ($72 = $69), true));
}
