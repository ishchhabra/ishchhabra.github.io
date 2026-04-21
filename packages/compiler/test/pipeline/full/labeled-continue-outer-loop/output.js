let blockparam_31 = undefined;
let blockparam_32 = undefined;
let blockparam_33 = undefined;
{
  let $62;
  blockparam_31 = 0;
  outer: for (
    ;
    (blockparam_32 = blockparam_31), blockparam_31 < 3;
    $62 = blockparam_33 + 1, blockparam_31 = $62
  ) {
    let blockparam_35 = undefined;
    let blockparam_36 = undefined;
    let blockparam_37 = undefined;
    {
      let $60;
      blockparam_35 = 0;
      for (
        ;
        (blockparam_36 = blockparam_35), blockparam_35 < 3;
        $60 = blockparam_37 + 1, blockparam_35 = $60
      ) {
        if (blockparam_36 === 1) {
          blockparam_33 = blockparam_32;
          continue outer;
        }
        console.log(blockparam_32, blockparam_36);
        blockparam_37 = blockparam_36;
      }
    }
    blockparam_33 = blockparam_32;
  }
}
