function $0($1) {
  let $11 = undefined;
  let blockparam_26 = undefined;
  try {
    if (sessionStorage.getItem("k")) {
      $11 = undefined;
      const $34 = JSON.parse($11);
      blockparam_26 = $34;
      return blockparam_26[$1];
    } else {
      $11 = undefined;
      const $34 = JSON.parse($11);
      blockparam_26 = $34;
      return blockparam_26[$1];
    }
  } catch ($15) {
    console.error($15);
    return;
  }
}
export { $0 as restore };
