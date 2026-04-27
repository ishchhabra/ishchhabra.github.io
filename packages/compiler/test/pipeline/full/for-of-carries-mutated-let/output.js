function $0($1) {
  const $22 = $1;
  let $16;
  let $17;
  $17 = "";
  for (const $6 of $22) {
    if ($6.id) {
      $16 = $6.id;
    } else {
      $16 = $17;
    }
    $17 = $16;
    continue;
  }
  return $17;
}
export { $0 as lastMatch };
