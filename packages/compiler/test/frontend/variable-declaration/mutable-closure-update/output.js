function $0_0() {
  let count = 0;
  const increment = () => {
    const $6_0 = count;
    count = count + 1;
    return $6_0;
  };
  const get = () => count;
  increment();
  return get();
}
