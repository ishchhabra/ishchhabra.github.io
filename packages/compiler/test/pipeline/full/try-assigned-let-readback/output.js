function $0($1) {
  let $28;
  try {
    $28 = JSON.parse(sessionStorage.getItem("k") || "{}");
  } catch ($14) {
    console.error($14);
    return;
  }
  return $28[$1];
}
export { $0 as restore };
