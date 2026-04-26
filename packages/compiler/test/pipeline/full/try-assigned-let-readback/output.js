function $0($1) {
  let $10;
  let $28;
  try {
    const $27 = sessionStorage.getItem("k");
    if ($27) {
      $10 = $27;
    } else {
      $10 = "{}";
    }
    $28 = JSON.parse($10);
  } catch ($14) {
    console.error($14);
    return;
  }
  return $28[$1];
}
export { $0 as restore };
