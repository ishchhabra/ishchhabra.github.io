function $0($1) {
  let $34;
  let $35;
  $35 = "";
  let $36;
  $36 = 0;
  for (let $43; $36 < $1.length; $43 = $36 + 1, $35 = $34, $36 = $43) {
    if ($1[$36] === "x") {
      const $44 = $35 + "/X";
      $34 = $44;
      continue;
    }
    const $45 = $35 + "/Y";
    $34 = $45;
  }
  return $35;
}
export { $0 as resolve };
