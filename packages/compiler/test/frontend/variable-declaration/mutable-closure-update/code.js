function counter() {
  let count = 0;
  const increment = () => count++;
  const get = () => count;
  increment();
  return get();
}
