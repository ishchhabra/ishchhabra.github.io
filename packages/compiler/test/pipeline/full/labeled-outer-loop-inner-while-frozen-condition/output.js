function $0($1) {
  const $95 = $1.nextSub;
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
  $72 = undefined;
  top: do {
    if ($64.flags & 1) {
      const $96 = $64.sub;
      if ($96 !== undefined) {
        const $97 = $96.nextSub;
        if ($97 !== undefined) {
          const $98 = {
            value: $66,
            prev: $72,
          };
          $68 = $97;
          $73 = $98;
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
      const $99 = $66.nextSub;
      $61 = $66;
      $65 = $99;
      $69 = $72;
      continue;
    }
    $70 = $72;
    while ($70 !== undefined) {
      const $100 = $70.value;
      const $101 = $70.prev;
      if ($100 !== undefined) {
        const $102 = $100.nextSub;
        $61 = $100;
        $65 = $102;
        $69 = $101;
        continue top;
      }
      $70 = $101;
      continue;
    }
    break;
  } while ((($64 = $61), ($66 = $65), ($72 = $69), true));
}
