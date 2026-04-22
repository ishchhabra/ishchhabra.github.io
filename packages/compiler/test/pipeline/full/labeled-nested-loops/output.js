let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
outer: for (; blockparam_37 < 5; ) {
  blockparam_38 = 0;
  inner: for (; blockparam_38 < 5; ) {
    if (blockparam_38 === 2) {
      continue inner;
    }
    if (blockparam_38 === 3) {
      continue outer;
    }
    if (blockparam_37 === 4) {
      break outer;
    }
    console.log(blockparam_37, blockparam_38);
    continue;
  }
  continue;
}
