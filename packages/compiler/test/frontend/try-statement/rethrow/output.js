try {
  JSON.parse("invalid");
} catch (f) {
  console.log(f);
  throw f;
}
