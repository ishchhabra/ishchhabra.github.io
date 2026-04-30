let $37 = 0;
let $38;
let $39 = undefined;
outer: for (; $37 < 5; $37++, $39 = $38) {
  $38 = 0;
  inner: for (; $38 < 5; $38++) {
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
