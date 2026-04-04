const $0_0 = function $0_0($1_0) {
  let result = "default";
  let $13_phi_18 = undefined;
  $13_phi_18 = result;
  try {
    $2_1 = JSON.parse($1_0);
    $13_phi_18 = $2_1;
  } catch ($9_0) {
    $2_2 = "error";
    $13_phi_18 = $2_2;
  }
  return $13_phi_18;
};
