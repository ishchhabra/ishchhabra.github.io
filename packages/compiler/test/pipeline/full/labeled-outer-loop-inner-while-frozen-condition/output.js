function $0($1) {
  const $177 = $1.nextSub;
  let blockparam_64 = undefined;
  blockparam_64 = $1;
  let blockparam_65 = undefined;
  let blockparam_67 = undefined;
  blockparam_67 = undefined;
  let blockparam_68 = undefined;
  let blockparam_70 = undefined;
  blockparam_70 = $177;
  let blockparam_71 = undefined;
  top: while (
    ((blockparam_65 = blockparam_64),
    (blockparam_68 = blockparam_67),
    (blockparam_71 = blockparam_70),
    true)
  ) {
    let blockparam_74 = undefined;
    let blockparam_75 = undefined;
    if (blockparam_65.flags & 1) {
      const $179 = blockparam_65.sub;
      let blockparam_76 = undefined;
      let blockparam_77 = undefined;
      let blockparam_78 = undefined;
      if ($179 !== undefined) {
        const $181 = $179.nextSub;
        let blockparam_79 = undefined;
        let blockparam_80 = undefined;
        if ($181 !== undefined) {
          const $183 = {
            value: blockparam_71,
            prev: blockparam_68,
          };
          blockparam_79 = $183;
          blockparam_80 = $181;
        } else {
          blockparam_79 = blockparam_68;
          blockparam_80 = blockparam_71;
        }
        blockparam_64 = $179;
        blockparam_67 = blockparam_79;
        blockparam_70 = blockparam_80;
        continue;
      } else {
        blockparam_76 = blockparam_65;
        blockparam_77 = blockparam_68;
        blockparam_78 = blockparam_71;
      }
      blockparam_74 = blockparam_77;
      blockparam_75 = blockparam_78;
    } else {
      blockparam_74 = blockparam_68;
      blockparam_75 = blockparam_71;
    }
    let blockparam_81 = undefined;
    if (blockparam_75 !== undefined) {
      const $185 = blockparam_75.nextSub;
      blockparam_64 = blockparam_75;
      blockparam_67 = blockparam_74;
      blockparam_70 = $185;
      continue;
    } else {
      blockparam_81 = blockparam_75;
    }
    let blockparam_82 = undefined;
    blockparam_82 = blockparam_75;
    let blockparam_84 = undefined;
    let blockparam_85 = undefined;
    blockparam_85 = blockparam_74;
    let blockparam_86 = undefined;
    let blockparam_87 = undefined;
    let blockparam_88 = undefined;
    blockparam_88 = blockparam_81;
    let blockparam_89 = undefined;
    let blockparam_90 = undefined;
    while (
      ((blockparam_84 = blockparam_82),
      (blockparam_86 = blockparam_85),
      (blockparam_87 = blockparam_85),
      (blockparam_89 = blockparam_88),
      (blockparam_90 = blockparam_88),
      blockparam_85 !== undefined)
    ) {
      const $187 = blockparam_86.value;
      const $189 = blockparam_86.prev;
      let blockparam_91 = undefined;
      if ($187 !== undefined) {
        const $191 = $187.nextSub;
        blockparam_64 = $187;
        blockparam_67 = $189;
        blockparam_70 = $191;
        continue top;
      } else {
        blockparam_91 = blockparam_89;
      }
      blockparam_82 = $187;
      blockparam_85 = $189;
      blockparam_88 = blockparam_91;
    }
    if (false) {
      break top;
    }
    break;
  }
}
