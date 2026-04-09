function $0_0($1_0) {
  let result = "default";
  let $12_phi_14 = undefined;
  $12_phi_14 = result;
  try {
    result = JSON.parse($1_0);
    $12_phi_14 = result;
  } catch (e) {
    result = "error";
    $12_phi_14 = result;
  }
  return $12_phi_14;
}
