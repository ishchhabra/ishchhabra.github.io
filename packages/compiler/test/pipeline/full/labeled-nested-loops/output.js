let $39;
$39 = 0;
let $40;
outer: for (let $49; $39 < 5; $49 = $39 + 1, $39 = $49) {
  $40 = 0;
  inner: for (let $51; $40 < 5; $51 = $40 + 1, $40 = $51) {
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
