const a = function a() {
  return typeof window !== "undefined";
};
const b = function b() {
  if (!(typeof window !== "undefined")) {
    return;
  }
  console.log("injected");
};
