let d = "unknown";
const g = 2;
let t = undefined;
t = d;
switch (g) {
  case 1: {
    e = "one";
    t = e;
    break;
  }
  case 2: {
    c = "two";
    t = c;
    break;
  }
  default: {
    a = "other";
    t = a;
    break;
  }
}
console.log(t);
