try {
  try {
    JSON.parse("invalid");
  } catch (a) {
    console.log(a);
  }
} catch (d) {
  console.log(d);
}
