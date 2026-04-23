function $0($1) {
  let blockparam_34 = undefined;
  let blockparam_35 = undefined;
  blockparam_35 = "";
  let blockparam_36 = undefined;
  blockparam_36 = 0;
  for (
    let $49;
    blockparam_36 < $1.length;
    $49 = blockparam_36 + 1, blockparam_35 = blockparam_34, blockparam_36 = $49
  ) {
    if ($1[blockparam_36] === "x") {
      const $51 = blockparam_35 + "/X";
      blockparam_34 = $51;
      continue;
    }
    const $53 = blockparam_35 + "/Y";
    blockparam_34 = $53;
  }
  return blockparam_35;
}
export { $0 as resolve };
