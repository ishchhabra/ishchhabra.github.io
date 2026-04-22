let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
let blockparam_39 = undefined;
outer: for (; blockparam_37 < 5; blockparam_37 = $54) {
  blockparam_38 = 0;
  inner: for (; blockparam_38 < 5; blockparam_38 = $56) {
    if (blockparam_38 === 2) {
      continue;
    }
    if (blockparam_38 === 3) {
      blockparam_39 = blockparam_38;
      continue outer;
    }
    if (blockparam_37 === 4) {
      break outer;
    }
    console.log(blockparam_37, blockparam_38);
    continue;
    const $56 = blockparam_38 + 1;
    continue;
  }
  blockparam_39 = blockparam_38;
  continue;
  const $54 = blockparam_37 + 1;
  continue;
}
