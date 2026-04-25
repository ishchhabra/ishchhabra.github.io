let $39;
$39 = 0;
let $40;
let $41;
$41 = undefined;
outer: for (let $52; $39 < 5; $52 = $39 + 1, $39 = $52, $41 = $40) {
  $40 = 0;
  inner: for (let $54; $40 < 5; $54 = $40 + 1, $40 = $54) {
    if ($40 === 2) {
      continue;
    }
    if ($40 === 3) {
      continue outer;
    }
    if ($39 === 4) {
      break outer;
    }
    console.log($39, $40);
  }
}
