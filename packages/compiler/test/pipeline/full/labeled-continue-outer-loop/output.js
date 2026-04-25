let $33;
$33 = 0;
let $34;
outer: for (let $42; $33 < 3; $42 = $33 + 1, $33 = $42) {
  $34 = 0;
  for (let $44; $34 < 3; $44 = $34 + 1, $34 = $44) {
    if ($34 === 1) {
      continue outer;
    }
    console.log($33, $34);
  }
}
