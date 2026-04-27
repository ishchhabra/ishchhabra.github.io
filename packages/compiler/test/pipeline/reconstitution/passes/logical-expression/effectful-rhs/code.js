function rhs() {
  console.log("rhs");
  return 1;
}

const a = globalThis.a;
console.log(a || rhs());
