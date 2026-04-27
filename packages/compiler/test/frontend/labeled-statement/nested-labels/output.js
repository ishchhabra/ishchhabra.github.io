let $37;
let $38;
let $39;
$37 = 0;
$39 = undefined;
outer: for (; $37 < 5; $37 = $37 + 1, $39 = $38) {
  $38 = 0;
  inner: for (; $38 < 5; $38 = $38 + 1) {
    if ($38 === 2) {
      continue;
    }
    if ($38 === 3) {
      continue outer;
    }
    if ($37 === 4) {
      break outer;
    }
    console.log($37, $38);
  }
}
