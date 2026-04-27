function $0($1) {
  let $26;
  try {
    $26 = JSON.parse(sessionStorage.getItem("k") || "{}");
  } catch ($14) {
    console.error($14);
    return;
  }
  return $26[$1];
}
export { $0 as restore };
