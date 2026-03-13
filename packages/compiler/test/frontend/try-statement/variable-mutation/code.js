function parse(input) {
  let result = "default";
  try {
    result = JSON.parse(input);
  } catch (e) {
    result = "error";
  }
  return result;
}
