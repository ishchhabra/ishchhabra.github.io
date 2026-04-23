let blockparam_31 = undefined;
blockparam_31 = 0;
let blockparam_32 = undefined;
outer: for (let $43; blockparam_31 < 3; $43 = blockparam_31 + 1, blockparam_31 = $43) {
  blockparam_32 = 0;
  for (let $45; blockparam_32 < 3; $45 = blockparam_32 + 1, blockparam_32 = $45) {
    if (blockparam_32 === 1) {
      break outer;
    }
    console.log(blockparam_31, blockparam_32);
  }
}
