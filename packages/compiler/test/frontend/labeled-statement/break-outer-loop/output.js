let blockparam_31 = undefined;
blockparam_31 = 0;
let blockparam_32 = undefined;
let blockparam_33 = undefined;
blockparam_33 = undefined;
outer: for (
  let $47;
  blockparam_31 < 3;
  $47 = blockparam_31 + 1, blockparam_31 = $47, blockparam_33 = blockparam_32
) {
  blockparam_32 = 0;
  for (let $49; blockparam_32 < 3; $49 = blockparam_32 + 1, blockparam_32 = $49) {
    if (blockparam_32 === 1) {
      break outer;
    }
    console.log(blockparam_31, blockparam_32);
  }
}
