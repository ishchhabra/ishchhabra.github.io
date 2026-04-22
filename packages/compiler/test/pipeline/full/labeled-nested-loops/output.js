let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
for (; blockparam_37 < 5; ) {
  blockparam_38 = 0;
  for (; blockparam_38 < 5; ) {
    if (blockparam_38 === 2) {
      continue inner;
    } else {
      if (blockparam_38 === 3) {
        continue outer;
      } else {
        if (blockparam_37 === 4) {
          break outer;
        } else {
          console.log(blockparam_37, blockparam_38);
          continue;
        }
      }
    }
  }
  continue;
}
