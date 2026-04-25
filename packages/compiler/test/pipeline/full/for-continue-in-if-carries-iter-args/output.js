function $0($1) {
  let $37;
  let $38;
  $38 = "";
  let $39;
  $39 = 0;
  for (let $49; $39 < $1.length; $49 = $39 + 1, $38 = $37, $39 = $49) {
    if ($1[$39] === "x") {
      const $51 = $38 + "/X";
      $37 = $51;
      continue;
    }
    const $53 = $38 + "/Y";
    $37 = $53;
  }
  return $38;
}
export { $0 as resolve };
