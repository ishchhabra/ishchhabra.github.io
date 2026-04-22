foo: {
  if (x) {
    break foo;
  }
  console.log("inside");
  break foo;
}
console.log("after");
