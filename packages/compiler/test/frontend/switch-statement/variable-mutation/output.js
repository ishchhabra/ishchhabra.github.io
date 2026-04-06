let d = "unknown";
const g = 2;
let z = undefined;
z = d;
switch (g) {
  case 1: {
    s = "one";
    z = s;
    break;
  }
  case 2: {
    p = "two";
    z = p;
    break;
  }
  default: {
    m = "other";
    z = m;
    break;
  }
}
console.log(z);
