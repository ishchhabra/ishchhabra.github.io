let blockparam_31 = undefined;
let blockparam_32 = undefined;
let blockparam_33 = undefined;
{
  let $61;
  blockparam_31 = 0;
  outer: for (
    ;
    (blockparam_32 = blockparam_31), blockparam_31 < 3;
    $61 = blockparam_33 + 1, blockparam_31 = $61
  ) {
    let blockparam_35 = undefined;
    let blockparam_36 = undefined;
    let blockparam_37 = undefined;
    {
      let $59;
      blockparam_35 = 0;
      for (
        ;
        (blockparam_36 = blockparam_35), blockparam_35 < 3;
        $59 = blockparam_37 + 1, blockparam_35 = $59
      ) {
        if (blockparam_36 === 1) {
          break outer;
        }
        console.log(blockparam_32, blockparam_36);
        blockparam_37 = blockparam_36;
      }
    }
    blockparam_33 = blockparam_32;
  }
}
