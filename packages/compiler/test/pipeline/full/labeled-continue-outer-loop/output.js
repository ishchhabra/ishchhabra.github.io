let blockparam_31 = undefined;
blockparam_31 = 0;
let blockparam_32 = undefined;
outer: for (let $42; blockparam_31 < 3; $42 = blockparam_31 + 1, blockparam_31 = $42) {
  blockparam_32 = 0;
  for (let $44; blockparam_32 < 3; $44 = blockparam_32 + 1, blockparam_32 = $44) {
    if (blockparam_32 === 1) {
      continue outer;
    }
    console.log(blockparam_31, blockparam_32);
  }
}
