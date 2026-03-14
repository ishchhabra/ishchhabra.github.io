function outer() {
  let sum = 0;
  const add = () => sum;

  for (let i = 0; i < 3; i++) {
    sum += i;
  }

  return add();
}
