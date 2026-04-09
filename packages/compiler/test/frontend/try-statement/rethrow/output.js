try {
  JSON.parse("invalid");
} catch (e) {
  console.log(e);
  throw e;
}
