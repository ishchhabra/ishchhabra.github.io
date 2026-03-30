function getObj() {
  return a;
}

function key() {
  return "b";
}

function foo() {
  return 3;
}

let a = { b: 0 };
const result = getObj()[key()] ||= foo();
