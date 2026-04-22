function $0($1) {
  let $11 = undefined;
  let blockparam_26 = undefined;
  try {
    const $34 = sessionStorage.getItem("k");
    if ($34) {
      $11 = $34;
    } else {
      $11 = "{}";
    }
    const $36 = JSON.parse($11);
    blockparam_26 = $36;
  } catch ($15) {
    console.error($15);
    return;
  }
  return blockparam_26[$1];
}
export { $0 as restore };
