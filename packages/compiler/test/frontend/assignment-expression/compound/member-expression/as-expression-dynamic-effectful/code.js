function key() {
  return "b";
}

function foo() {
  return 3;
}

let a = { b: 1 };
const result = a[key()] += foo();
