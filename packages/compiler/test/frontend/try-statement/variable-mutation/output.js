function $0_0($1_0) {
  let $2_0 = "default";
  try {
    $2_0 = JSON.parse($1_0);
  } catch ($10_0) {
    $2_0 = "error";
  }
  return $2_0;
}
