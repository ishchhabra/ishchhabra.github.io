function test(attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (key !== "x") {
      g(value ? "" : String(value));
    }
  }
}
