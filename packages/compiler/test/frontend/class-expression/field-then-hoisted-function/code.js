const k = 1;
var C = class {
  x = k;
};
function afterClass() {
  return k;
}
export { afterClass };
