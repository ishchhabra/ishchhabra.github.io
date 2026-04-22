let blockparam_31 = undefined;
blockparam_31 = 0;
let blockparam_32 = undefined;
let blockparam_33 = undefined;
outer: for (; blockparam_31 < 3; ) {
  blockparam_32 = 0;
  for (; blockparam_32 < 3; ) {
    if (blockparam_32 === 1) {
      blockparam_33 = blockparam_32;
      continue outer;
    }
    console.log(blockparam_31, blockparam_32);
    continue;
  }
  blockparam_33 = blockparam_32;
  continue;
}
