let $37;
let $38;
$37 = 0;
outer: for (; $37 < 5; $37 = $37 + 1) {
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
