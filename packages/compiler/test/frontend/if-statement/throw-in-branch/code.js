function test(condition) {
  if (condition) {
    doSomething();
  } else {
    throw new Error("fail");
  }
}
