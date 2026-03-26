var a = 1;
function f() {
  var a = 2;
  if (Math.random()) {
    a = 3;
  }
  return a;
}
export { f };
