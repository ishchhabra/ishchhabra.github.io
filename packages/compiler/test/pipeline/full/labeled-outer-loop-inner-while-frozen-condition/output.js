function $0($1) {
  const $100 = $1.nextSub;
  let blockparam_62 = undefined;
  blockparam_62 = $1;
  let blockparam_65 = undefined;
  blockparam_65 = $100;
  let blockparam_66 = undefined;
  let blockparam_67 = undefined;
  blockparam_67 = undefined;
  let blockparam_68 = undefined;
  let blockparam_70 = undefined;
  top: do {
    if (blockparam_62.flags & 1) {
      const $102 = blockparam_62.sub;
      if ($102 !== undefined) {
        const $104 = $102.nextSub;
        if ($104 !== undefined) {
          const $106 = {
            value: blockparam_65,
            prev: blockparam_67,
          };
          blockparam_66 = $104;
          blockparam_70 = $106;
        } else {
          blockparam_66 = blockparam_65;
          blockparam_70 = blockparam_67;
        }
        blockparam_62 = $102;
        blockparam_65 = blockparam_66;
        blockparam_67 = blockparam_70;
        continue;
      }
    }
    if (blockparam_65 !== undefined) {
      const $108 = blockparam_65.nextSub;
      blockparam_62 = blockparam_65;
      blockparam_65 = $108;
      continue;
    }
    blockparam_68 = blockparam_67;
    while (blockparam_68 !== undefined) {
      const $110 = blockparam_68.value;
      const $112 = blockparam_68.prev;
      if ($110 !== undefined) {
        const $114 = $110.nextSub;
        blockparam_62 = $110;
        blockparam_65 = $114;
        blockparam_67 = $112;
        continue top;
      }
      blockparam_68 = $112;
      continue;
    }
  } while (true);
}
