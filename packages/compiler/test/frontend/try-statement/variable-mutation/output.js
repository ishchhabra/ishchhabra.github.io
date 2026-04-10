function $0_0($1_0) {
  let $2_0 = "default";
  let $12_phi_14 = undefined;
  $12_phi_14 = $2_0;
  try {
    $2_0 = JSON.parse($1_0);
    $12_phi_14 = $2_0;
  } catch ($9_0) {
    $2_0 = "error";
    $12_phi_14 = $2_0;
  }
  return $12_phi_14;
}
