let $31;
let $32;
let $33;
$31 = 0;
$33 = undefined;
outer: for (let $41; $31 < 3; $41 = $31 + 1, $31 = $41, $33 = $32) {
  $32 = 0;
  for (let $42; $32 < 3; $42 = $32 + 1, $32 = $42) {
    if ($32 === 1) {
      break outer;
    }
    console.log($31, $32);
  }
}
