function $0($1) {
  const $109 = $1.nextSub;
  let $66;
  let $69;
  $69 = $1;
  let $70;
  let $71;
  $71 = $109;
  let $73;
  let $74;
  let $75;
  let $77;
  $77 = undefined;
  let $78;
  top: do {
    if ($69.flags & 1) {
      const $111 = $69.sub;
      if ($111 !== undefined) {
        const $113 = $111.nextSub;
        if ($113 !== undefined) {
          const $115 = {
            value: $71,
            prev: $77,
          };
          $73 = $113;
          $78 = $115;
        } else {
          $73 = $71;
          $78 = $77;
        }
        $66 = $111;
        $70 = $73;
        $74 = $78;
        continue;
      }
    }
    if ($71 !== undefined) {
      const $117 = $71.nextSub;
      $66 = $71;
      $70 = $117;
      $74 = $77;
      continue;
    }
    $75 = $77;
    while ($75 !== undefined) {
      const $119 = $75.value;
      const $121 = $75.prev;
      if ($119 !== undefined) {
        const $123 = $119.nextSub;
        $66 = $119;
        $70 = $123;
        $74 = $121;
        continue top;
      }
      $75 = $121;
      continue;
    }
    break;
  } while ((($69 = $66), ($71 = $70), ($77 = $74), true));
}
