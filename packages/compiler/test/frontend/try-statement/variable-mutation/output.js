function $0($1) {
  let $2 = "default";
  try {
    $2 = JSON.parse($1);
  } catch ($10) {
    $2 = "error";
  }
  return $2;
}
