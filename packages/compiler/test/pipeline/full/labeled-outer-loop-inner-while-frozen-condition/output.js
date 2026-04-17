function $0_0($1_0) {
  let $2_0 = $1_0.nextSub;
  let $3_0 = undefined;
  let $64_blockparam_64 = undefined;
  $64_blockparam_64 = $1_0;
  let $65_blockparam_65 = undefined;
  let $67_blockparam_67 = undefined;
  $67_blockparam_67 = $3_0;
  let $68_blockparam_68 = undefined;
  let $70_blockparam_70 = undefined;
  $70_blockparam_70 = $2_0;
  let $71_blockparam_71 = undefined;
  top: while (
    (($65_blockparam_65 = $64_blockparam_64),
    ($68_blockparam_68 = $67_blockparam_67),
    ($71_blockparam_71 = $70_blockparam_70),
    true)
  ) {
    let $79_0 = undefined;
    let $80_0 = undefined;
    if ($65_blockparam_65.flags & 1) {
      const $14_0 = $65_blockparam_65.sub;
      let $75_0 = undefined;
      let $76_0 = undefined;
      let $77_0 = undefined;
      if ($14_0 !== undefined) {
        $1_0 = $14_0;
        const $21_0 = $14_0.nextSub;
        if ($21_0 !== undefined) {
          $3_0 = {
            value: $71_blockparam_71,
            prev: $68_blockparam_68,
          };
          $2_0 = $21_0;
        } else {
        }
        continue;
      } else {
        $75_0 = $65_blockparam_65;
        $75_0 = $65_blockparam_65;
        $76_0 = $68_blockparam_68;
        $76_0 = $68_blockparam_68;
        $77_0 = $71_blockparam_71;
        $77_0 = $71_blockparam_71;
      }
      $79_0 = $76_0;
      $80_0 = $77_0;
    } else {
      $79_0 = $68_blockparam_68;
      $79_0 = $68_blockparam_68;
      $80_0 = $71_blockparam_71;
      $80_0 = $71_blockparam_71;
    }
    $1_0 = $80_0;
    let $81_0 = undefined;
    if ($80_0 !== undefined) {
      $2_0 = $1_0.nextSub;
      continue;
    } else {
      $81_0 = $80_0;
      $81_0 = $80_0;
    }
    let $82_blockparam_82 = undefined;
    $82_blockparam_82 = $1_0;
    let $85_blockparam_85 = undefined;
    $85_blockparam_85 = $79_0;
    let $86_blockparam_86 = undefined;
    let $88_blockparam_88 = undefined;
    $88_blockparam_88 = $81_0;
    let $89_blockparam_89 = undefined;
    while (
      (($86_blockparam_86 = $85_blockparam_85),
      ($89_blockparam_89 = $88_blockparam_88),
      $85_blockparam_85 !== undefined)
    ) {
      $1_0 = $86_blockparam_86.value;
      $3_0 = $86_blockparam_86.prev;
      let $91_0 = undefined;
      if ($1_0 !== undefined) {
        $2_0 = $1_0.nextSub;
        continue top;
      } else {
        $91_0 = $89_blockparam_89;
        $91_0 = $89_blockparam_89;
      }
      $82_blockparam_82 = $1_0;
      $85_blockparam_85 = $3_0;
      $88_blockparam_88 = $91_0;
    }
    if (!true) {
      break top;
    }
    break;
  }
}
