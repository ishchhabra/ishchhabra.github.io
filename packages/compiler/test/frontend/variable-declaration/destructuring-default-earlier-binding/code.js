function f(tokens) {
  const [, theirName, myName = theirName] = tokens;
  return myName;
}
