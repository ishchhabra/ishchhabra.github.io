const d = "greet";
let g = undefined;
let z = undefined;
z = g;
switch (d) {
  case "greet": {
    s = "hello";
    z = s;
    break;
  }
  case "farewell": {
    p = "goodbye";
    z = p;
    break;
  }
  default: {
    m = "unknown action";
    z = m;
    break;
  }
}
console.log(z);
