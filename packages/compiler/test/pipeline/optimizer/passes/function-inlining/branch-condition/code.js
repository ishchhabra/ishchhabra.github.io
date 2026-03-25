function isBrowser() {
  return typeof window !== "undefined";
}

function inject() {
  if (!isBrowser()) return;
  console.log("injected");
}
