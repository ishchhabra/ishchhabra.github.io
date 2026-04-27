let $37;
let $38;
let $39;
$37 = 0;
$39 = undefined;
outer: for (let $47; $37 < 5; $47 = $37 + 1, $37 = $47, $39 = $38) {
  $38 = 0;
  inner: for (let $48; $38 < 5; $48 = $38 + 1, $38 = $48) {
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
