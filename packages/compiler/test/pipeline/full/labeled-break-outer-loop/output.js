let blockparam_31 = undefined;
let blockparam_32 = undefined;
let blockparam_33 = undefined;
let blockparam_34 = undefined;
{
  let $0 = 0;
  blockparam_31 = $0;
  outer: for (
    ;
    (blockparam_32 = blockparam_31), (blockparam_34 = blockparam_31), blockparam_31 < 3;
    $0 = blockparam_33 + 1, blockparam_31 = $0
  ) {
    let blockparam_35 = undefined;
    let blockparam_36 = undefined;
    let blockparam_37 = undefined;
    let blockparam_38 = undefined;
    {
      let $6 = 0;
      blockparam_35 = $6;
      for (
        ;
        (blockparam_36 = blockparam_35), (blockparam_38 = blockparam_35), blockparam_35 < 3;
        $6 = blockparam_37 + 1, blockparam_35 = $6
      ) {
        if (blockparam_36 === 1) {
          blockparam_34 = blockparam_32;
          break outer;
        }
        console.log(blockparam_32, blockparam_36);
        blockparam_37 = blockparam_36;
      }
    }
    blockparam_33 = blockparam_32;
  }
}
