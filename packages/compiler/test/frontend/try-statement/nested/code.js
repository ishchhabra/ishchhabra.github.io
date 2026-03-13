try {
  try {
    JSON.parse("invalid");
  } catch (inner) {
    console.log(inner);
  }
} catch (outer) {
  console.log(outer);
}
