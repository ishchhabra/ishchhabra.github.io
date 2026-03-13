try {
  const result = JSON.parse("{}");
} catch (e) {
  console.log(e);
} finally {
  console.log("done");
}
