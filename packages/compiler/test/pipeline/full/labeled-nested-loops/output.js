let $35_blockparam_37 = undefined;
let $36_blockparam_38 = undefined;
let $37_blockparam_39 = undefined;
let $38_blockparam_40 = undefined;
{
  let $0_0 = 0;
  $35_blockparam_37 = $0_0;
  outer: for (
    ;
    ($36_blockparam_38 = $35_blockparam_37),
      ($38_blockparam_40 = $35_blockparam_37),
      $35_blockparam_37 < 5;
    $0_0 = $37_blockparam_39 + 1, $35_blockparam_37 = $0_0
  ) {
    let $39_blockparam_41 = undefined;
    let $40_blockparam_42 = undefined;
    let $41_blockparam_43 = undefined;
    let $42_blockparam_44 = undefined;
    {
      let $6_0 = 0;
      $39_blockparam_41 = $6_0;
      inner: for (
        ;
        ($40_blockparam_42 = $39_blockparam_41),
          ($42_blockparam_44 = $39_blockparam_41),
          $39_blockparam_41 < 5;
        $6_0 = $41_blockparam_43 + 1, $39_blockparam_41 = $6_0
      ) {
        if ($40_blockparam_42 === 2) {
          $41_blockparam_43 = $40_blockparam_42;
          continue inner;
        }
        if ($40_blockparam_42 === 3) {
          $37_blockparam_39 = $36_blockparam_38;
          continue outer;
        }
        if ($36_blockparam_38 === 4) {
          $38_blockparam_40 = $36_blockparam_38;
          break outer;
        }
        console.log($36_blockparam_38, $40_blockparam_42);
        $41_blockparam_43 = $40_blockparam_42;
      }
    }
    $37_blockparam_39 = $36_blockparam_38;
  }
}
