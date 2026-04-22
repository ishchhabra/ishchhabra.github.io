foo: {
  if (x) {
    break foo;
  }
  console.log("inside");
}
console.log("after");
