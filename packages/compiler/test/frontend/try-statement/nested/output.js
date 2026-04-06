try {
  try {
    JSON.parse("invalid");
  } catch (f) {
    console.log(f);
  }
} catch (l) {
  console.log(l);
}
