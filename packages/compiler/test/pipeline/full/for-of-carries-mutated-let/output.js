function $0($1) {
  let $16;
  let $17;
  $17 = "";
  for (const $6 of $1) {
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
