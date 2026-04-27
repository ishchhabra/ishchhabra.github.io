let $37;
let $38;
$37 = 0;
outer: for (let $45; $37 < 5; $45 = $37 + 1, $37 = $45) {
  $38 = 0;
  inner: for (let $46; $38 < 5; $46 = $38 + 1, $38 = $46) {
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
