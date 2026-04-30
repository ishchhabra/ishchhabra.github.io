function $0($1) {
  let $34;
  let $35 = "";
  let $36 = 0;
  for (; $36 < $1.length; $35 = $34, $36++) {
    if ($1[$36] === "x") {
      $34 = $35 + "/X";
      continue;
    }
    $34 = $35 + "/Y";
  }
  return $35;
}
export { $0 as resolve };
