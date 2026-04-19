function $0($1) {
  let $2 = $1.nextSub;
  let $3 = undefined;
  let blockparam_64 = undefined;
  blockparam_64 = $1;
  let blockparam_65 = undefined;
  let blockparam_66 = undefined;
  let blockparam_67 = undefined;
  blockparam_67 = $3;
  let blockparam_68 = undefined;
  let blockparam_69 = undefined;
  let blockparam_70 = undefined;
  blockparam_70 = $2;
  let blockparam_71 = undefined;
  let blockparam_72 = undefined;
  top: while (
    ((blockparam_65 = blockparam_64),
    (blockparam_66 = blockparam_64),
    (blockparam_68 = blockparam_67),
    (blockparam_69 = blockparam_67),
    (blockparam_71 = blockparam_70),
    (blockparam_72 = blockparam_70),
    true)
  ) {
    let $78 = undefined;
    let $79 = undefined;
    let $80 = undefined;
    if (blockparam_65.flags & 1) {
      const $14 = blockparam_65.sub;
      let $75 = undefined;
      let $76 = undefined;
      let $77 = undefined;
      if ($14 !== undefined) {
        $1 = $14;
        const $21 = $14.nextSub;
        let $73 = undefined;
        let $74 = undefined;
        if ($21 !== undefined) {
          $3 = {
            value: blockparam_71,
            prev: blockparam_68,
          };
          $2 = $21;
          $73 = $3;
          $74 = $2;
        } else {
          $73 = blockparam_68;
          $73 = blockparam_68;
          $74 = blockparam_71;
          $74 = blockparam_71;
        }
        blockparam_64 = $1;
        blockparam_67 = $73;
        blockparam_70 = $74;
        continue;
      } else {
        $75 = blockparam_65;
        $75 = blockparam_65;
        $76 = blockparam_68;
        $76 = blockparam_68;
        $77 = blockparam_71;
        $77 = blockparam_71;
      }
      $78 = $75;
      $79 = $76;
      $80 = $77;
    } else {
      $78 = blockparam_65;
      $78 = blockparam_65;
      $79 = blockparam_68;
      $79 = blockparam_68;
      $80 = blockparam_71;
      $80 = blockparam_71;
    }
    $1 = $80;
    let $81 = undefined;
    if ($80 !== undefined) {
      $2 = $1.nextSub;
      blockparam_64 = $1;
      blockparam_67 = $79;
      blockparam_70 = $2;
      continue;
    } else {
      $81 = $80;
      $81 = $80;
    }
    let blockparam_82 = undefined;
    blockparam_82 = $1;
    let blockparam_83 = undefined;
    let blockparam_84 = undefined;
    let blockparam_85 = undefined;
    blockparam_85 = $79;
    let blockparam_86 = undefined;
    let blockparam_87 = undefined;
    let blockparam_88 = undefined;
    blockparam_88 = $81;
    let blockparam_89 = undefined;
    let blockparam_90 = undefined;
    while (
      ((blockparam_83 = blockparam_82),
      (blockparam_84 = blockparam_82),
      (blockparam_86 = blockparam_85),
      (blockparam_87 = blockparam_85),
      (blockparam_89 = blockparam_88),
      (blockparam_90 = blockparam_88),
      blockparam_85 !== undefined)
    ) {
      $1 = blockparam_86.value;
      $3 = blockparam_86.prev;
      let $91 = undefined;
      if ($1 !== undefined) {
        $2 = $1.nextSub;
        blockparam_64 = $1;
        blockparam_67 = $3;
        blockparam_70 = $2;
        continue top;
      } else {
        $91 = blockparam_89;
        $91 = blockparam_89;
      }
      blockparam_82 = $1;
      blockparam_85 = $3;
      blockparam_88 = $91;
    }
    if (false) {
      blockparam_66 = blockparam_84;
      blockparam_69 = blockparam_87;
      blockparam_72 = blockparam_90;
      break top;
    }
    blockparam_66 = blockparam_84;
    blockparam_69 = blockparam_87;
    blockparam_72 = blockparam_90;
    break;
  }
}
