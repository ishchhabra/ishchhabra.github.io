function foo() {
  return { x: 1 };
}

let x;
const result = ({ x } = foo());
