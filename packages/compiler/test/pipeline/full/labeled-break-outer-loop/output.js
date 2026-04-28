let $31;
let $32;
$31 = 0;
outer: for (; $31 < 3; $31 += 1) {
  $32 = 0;
  for (; $32 < 3; $32 += 1) {
    if ($32 === 1) {
      break outer;
    }
    console.log($31, $32);
  }
}
