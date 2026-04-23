let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
outer: for (let $49; blockparam_37 < 5; $49 = blockparam_37 + 1, blockparam_37 = $49) {
  blockparam_38 = 0;
  inner: for (let $51; blockparam_38 < 5; $51 = blockparam_38 + 1, blockparam_38 = $51) {
    if (blockparam_38 === 2) {
      continue;
    }
    if (blockparam_38 === 3) {
      continue outer;
    }
    if (blockparam_37 === 4) {
      break outer;
    }
    console.log(blockparam_37, blockparam_38);
  }
}
