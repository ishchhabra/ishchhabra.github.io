function $0($1) {
  let blockparam_15 = undefined;
  try {
    const $20 = JSON.parse($1);
    blockparam_15 = $20;
    return blockparam_15;
  } catch ($10) {
    blockparam_15 = "error";
    return blockparam_15;
  }
}
