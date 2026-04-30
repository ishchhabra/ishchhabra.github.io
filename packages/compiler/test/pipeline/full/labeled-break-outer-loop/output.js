let $31 = 0;
let $32;
outer: for (; $31 < 3; $31++) {
  $32 = 0;
  for (; $32 < 3; $32++) {
    if ($32 === 1) {
      break outer;
    }
    console.log($31, $32);
  }
}
