let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
let blockparam_39 = undefined;
blockparam_39 = undefined;
outer: for (
  let $53;
  blockparam_37 < 5;
  $53 = blockparam_37 + 1, blockparam_37 = $53, blockparam_39 = blockparam_38
) {
  blockparam_38 = 0;
  inner: for (let $55; blockparam_38 < 5; $55 = blockparam_38 + 1, blockparam_38 = $55) {
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
