function $0($1) {
  let $10;
  let $25;
  try {
    const $29 = sessionStorage.getItem("k");
    if ($29) {
      $10 = $29;
    } else {
      $10 = "{}";
    }
    const $30 = JSON.parse($10);
    $25 = $30;
  } catch ($14) {
    console.error($14);
    return;
  }
  return $25[$1];
}
export { $0 as restore };
