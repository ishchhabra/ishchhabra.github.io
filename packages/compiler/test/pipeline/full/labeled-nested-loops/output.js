let $37 = 0;
let $38;
outer: for (; $37 < 5; $37++) {
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
