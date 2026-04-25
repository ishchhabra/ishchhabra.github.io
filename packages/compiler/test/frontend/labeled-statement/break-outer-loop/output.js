let $33;
$33 = 0;
let $34;
let $35;
$35 = undefined;
outer: for (let $46; $33 < 3; $46 = $33 + 1, $33 = $46, $35 = $34) {
  $34 = 0;
  for (let $48; $34 < 3; $48 = $34 + 1, $34 = $48) {
    if ($34 === 1) {
      break outer;
    }
    console.log($33, $34);
  }
}
