try {
  JSON.parse("invalid");
} catch (c) {
  console.log(c);
  throw c;
}
