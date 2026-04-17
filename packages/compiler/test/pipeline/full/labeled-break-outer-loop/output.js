let $29_blockparam_31 = undefined;
let $30_blockparam_32 = undefined;
let $31_blockparam_33 = undefined;
let $32_blockparam_34 = undefined;
{
  let $0_0 = 0;
  $29_blockparam_31 = $0_0;
  outer: for (
    ;
    ($30_blockparam_32 = $29_blockparam_31),
      ($32_blockparam_34 = $29_blockparam_31),
      $29_blockparam_31 < 3;
    $0_0 = $31_blockparam_33 + 1, $29_blockparam_31 = $0_0
  ) {
    let $33_blockparam_35 = undefined;
    let $34_blockparam_36 = undefined;
    let $35_blockparam_37 = undefined;
    let $36_blockparam_38 = undefined;
    {
      let $6_0 = 0;
      $33_blockparam_35 = $6_0;
      for (
        ;
        ($34_blockparam_36 = $33_blockparam_35),
          ($36_blockparam_38 = $33_blockparam_35),
          $33_blockparam_35 < 3;
        $6_0 = $35_blockparam_37 + 1, $33_blockparam_35 = $6_0
      ) {
        if ($34_blockparam_36 === 1) {
          $32_blockparam_34 = $30_blockparam_32;
          break outer;
        }
        console.log($30_blockparam_32, $34_blockparam_36);
        $35_blockparam_37 = $34_blockparam_36;
      }
    }
    $31_blockparam_33 = $30_blockparam_32;
  }
}
