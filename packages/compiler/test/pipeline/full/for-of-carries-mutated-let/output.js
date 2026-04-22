function $0($1) {
  let blockparam_17 = undefined;
  blockparam_17 = "";
  let blockparam_18 = undefined;
  for (const $6 of $1) {
    const $31 = $6.id;
    let blockparam_19 = undefined;
    if ($31) {
      const $33 = $6.id;
      blockparam_19 = $33;
    } else {
      blockparam_19 = blockparam_17;
    }
    blockparam_17 = blockparam_19;
    blockparam_18 = blockparam_19;
  }
  return blockparam_18;
}
export { $0 as lastMatch };
