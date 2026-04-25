function $0($1) {
  let $11;
  let $27;
  try {
    const $33 = sessionStorage.getItem("k");
    if ($33) {
      $11 = $33;
    } else {
      $11 = "{}";
    }
    const $35 = JSON.parse($11);
    $27 = $35;
  } catch ($15) {
    console.error($15);
    return;
  }
  return $27[$1];
}
export { $0 as restore };
