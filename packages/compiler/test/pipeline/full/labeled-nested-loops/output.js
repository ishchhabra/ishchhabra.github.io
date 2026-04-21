let blockparam_37 = undefined;
let blockparam_38 = undefined;
let blockparam_39 = undefined;
{
  let $69;
  blockparam_37 = 0;
  outer: for (
    ;
    (blockparam_38 = blockparam_37), blockparam_37 < 5;
    $69 = blockparam_39 + 1, blockparam_37 = $69
  ) {
    let blockparam_41 = undefined;
    let blockparam_42 = undefined;
    let blockparam_43 = undefined;
    {
      let $67;
      blockparam_41 = 0;
      inner: for (
        ;
        (blockparam_42 = blockparam_41), blockparam_41 < 5;
        $67 = blockparam_43 + 1, blockparam_41 = $67
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
          break outer;
        }
        console.log(blockparam_38, blockparam_42);
        blockparam_43 = blockparam_42;
      }
    }
    blockparam_39 = blockparam_38;
  }
}
