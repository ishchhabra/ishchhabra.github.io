let $31;
$31 = 0;
let $32;
outer: for (let $38; $31 < 3; $38 = $31 + 1, $31 = $38) {
  $32 = 0;
  for (let $39; $32 < 3; $39 = $32 + 1, $32 = $39) {
    if ($32 === 1) {
      continue outer;
    }
    console.log($31, $32);
  }
}
