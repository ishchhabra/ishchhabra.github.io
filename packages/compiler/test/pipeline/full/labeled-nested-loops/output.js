let blockparam_37 = undefined;
let blockparam_38 = undefined;
let blockparam_39 = undefined;
let blockparam_40 = undefined;
{
  let $0 = 0;
  blockparam_37 = $0;
  outer: for (
    ;
    (blockparam_38 = blockparam_37), (blockparam_40 = blockparam_37), blockparam_37 < 5;
    $0 = blockparam_39 + 1, blockparam_37 = $0
  ) {
    let blockparam_41 = undefined;
    let blockparam_42 = undefined;
    let blockparam_43 = undefined;
    let blockparam_44 = undefined;
    {
      let $6 = 0;
      blockparam_41 = $6;
      inner: for (
        ;
        (blockparam_42 = blockparam_41), (blockparam_44 = blockparam_41), blockparam_41 < 5;
        $6 = blockparam_43 + 1, blockparam_41 = $6
      ) {
        if (blockparam_42 === 2) {
          blockparam_43 = blockparam_42;
          continue inner;
        }
        if (blockparam_42 === 3) {
          blockparam_39 = blockparam_38;
          continue outer;
        }
        if (blockparam_38 === 4) {
          blockparam_40 = blockparam_38;
          break outer;
        }
        console.log(blockparam_38, blockparam_42);
        blockparam_43 = blockparam_42;
      }
    }
    blockparam_39 = blockparam_38;
  }
}
