function safeParse(input) {
  try {
    return JSON.parse(input);
  } catch (e) {
    return null;
  }
}
