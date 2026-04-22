let blockparam_37 = undefined;
blockparam_37 = 0;
let blockparam_38 = undefined;
outer: for (; blockparam_37 < 5; ) {
  forBody$7: {
    blockparam_38 = 0;
    inner: for (; blockparam_38 < 5; ) {
      forBody$14: {
        if (blockparam_38 === 2) {
          break forBody$14;
        }
        if (blockparam_38 === 3) {
          break forBody$7;
        }
        if (blockparam_37 === 4) {
          break outer;
        }
        console.log(blockparam_37, blockparam_38);
      }
      const $52 = blockparam_38 + 1;
      blockparam_38 = $52;
    }
  }
  const $50 = blockparam_37 + 1;
  blockparam_37 = $50;
}
