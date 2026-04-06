try {
  const d = JSON.parse("{}");
} catch (c) {
  console.log(c);
} finally {
  console.log("done");
}
