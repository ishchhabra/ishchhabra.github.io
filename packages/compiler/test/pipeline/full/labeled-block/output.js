foo: {
  if (x) {
    break foo;
  } else {
    console.log("inside");
  }
}
console.log("after");
