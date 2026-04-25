function $0($1) {
  const $114 = $1.nextSub;
  let blockparam_62 = undefined;
  let blockparam_65 = undefined;
  blockparam_65 = $1;
  let blockparam_66 = undefined;
  let blockparam_67 = undefined;
  blockparam_67 = $114;
  let blockparam_69 = undefined;
  let blockparam_70 = undefined;
  let blockparam_71 = undefined;
  let blockparam_73 = undefined;
  blockparam_73 = undefined;
  let blockparam_74 = undefined;
  top: do {
    if (blockparam_65.flags & 1) {
      const $116 = blockparam_65.sub;
      if ($116 !== undefined) {
        const $118 = $116.nextSub;
        if ($118 !== undefined) {
          const $120 = {
            value: blockparam_67,
            prev: blockparam_73,
          };
          blockparam_69 = $118;
          blockparam_74 = $120;
        } else {
          blockparam_69 = blockparam_67;
          blockparam_74 = blockparam_73;
        }
        blockparam_62 = $116;
        blockparam_66 = blockparam_69;
        blockparam_70 = blockparam_74;
        continue;
      }
    }
    if (blockparam_67 !== undefined) {
      const $122 = blockparam_67.nextSub;
      blockparam_62 = blockparam_67;
      blockparam_66 = $122;
      blockparam_70 = blockparam_73;
      continue;
    }
    blockparam_71 = blockparam_73;
    while (blockparam_71 !== undefined) {
      const $124 = blockparam_71.value;
      const $126 = blockparam_71.prev;
      if ($124 !== undefined) {
        const $128 = $124.nextSub;
        blockparam_62 = $124;
        blockparam_66 = $128;
        blockparam_70 = $126;
        continue top;
      }
      blockparam_71 = $126;
      continue;
    }
    break;
  } while (
    ((blockparam_65 = blockparam_62),
    (blockparam_67 = blockparam_66),
    (blockparam_73 = blockparam_70),
    true)
  );
}
