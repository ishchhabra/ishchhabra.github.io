function $0() {
  return typeof window !== "undefined";
}
function $1() {
  if (!$0()) {
    return;
  } else {
    console.log("injected");
  }
}
