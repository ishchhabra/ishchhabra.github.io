function $0($1) {
  let blockparam_34 = undefined;
  let blockparam_35 = undefined;
  let blockparam_36 = undefined;
  let blockparam_37 = undefined;
  let blockparam_38 = undefined;
  let blockparam_39 = undefined;
  let blockparam_40 = undefined;
  {
    let $75;
    blockparam_34 = "";
    blockparam_38 = 0;
    for (
      ;
      (blockparam_35 = blockparam_34),
        (blockparam_37 = blockparam_34),
        (blockparam_39 = blockparam_38),
        blockparam_38 < $1.length;
      $75 = blockparam_40 + 1, blockparam_34 = blockparam_36, blockparam_38 = $75
    ) {
      let blockparam_42 = undefined;
      if ($1[blockparam_39] === "x") {
        const $73 = blockparam_35 + "/X";
        blockparam_36 = $73;
        blockparam_40 = blockparam_39;
        continue;
      } else {
        blockparam_42 = blockparam_35;
      }
      const $71 = blockparam_42 + "/Y";
      blockparam_36 = $71;
      blockparam_40 = blockparam_39;
    }
  }
  return blockparam_37;
}
export { $0 as resolve };
