const d = "greet";
let g = undefined;
let t = undefined;
t = g;
switch (d) {
  case "greet": {
    e = "hello";
    t = e;
    break;
  }
  case "farewell": {
    c = "goodbye";
    t = c;
    break;
  }
  default: {
    a = "unknown action";
    t = a;
    break;
  }
}
console.log(t);
