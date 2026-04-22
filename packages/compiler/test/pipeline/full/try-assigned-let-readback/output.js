function $0($1) {
  let $2 = undefined;
  try {
    const $30 = sessionStorage.getItem("k");
    let $12 = undefined;
    $2 = JSON.parse($30 ? $30 : "{}");
  } catch ($15) {
    console.error($15);
    return;
  }
  return $2[$1];
}
export { $0 as restore };
