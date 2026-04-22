function $0($1) {
  let blockparam_34 = undefined;
  let blockparam_35 = undefined;
  blockparam_35 = "";
  let blockparam_36 = undefined;
  blockparam_36 = 0;
  for (; blockparam_36 < $1.length; ) {
    if ($1[blockparam_36] === "x") {
      continue;
    } else {
      const $50 = blockparam_35 + "/Y";
      blockparam_34 = $50;
      const $48 = blockparam_36 + 1;
      blockparam_35 = blockparam_34;
      blockparam_36 = $48;
    }
  }
}
export { $0 as resolve };
