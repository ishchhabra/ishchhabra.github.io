let result = "unknown";
const x = globalThis.x;
switch (x) {
  case 1:
    result = "one";
    break;
  case 2:
    result = "two";
    break;
  default:
    result = "other";
    break;
}
console.log(result);
