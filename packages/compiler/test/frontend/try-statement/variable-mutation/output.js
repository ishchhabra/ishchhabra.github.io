function $0_0($1_0) {
  let result = "default";
  let $12_phi_16 = undefined;
  $12_phi_16 = result;
  try {
    $2_1 = JSON.parse($1_0);
    $12_phi_16 = $2_1;
  } catch ($9_0) {
    $2_2 = "error";
    $12_phi_16 = $2_2;
  }
  return $12_phi_16;
}
