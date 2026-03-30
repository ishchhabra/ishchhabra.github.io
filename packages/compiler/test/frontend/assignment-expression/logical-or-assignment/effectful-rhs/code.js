function foo() {
  return 5;
}

let a = 0;
const result = (a ||= foo());
