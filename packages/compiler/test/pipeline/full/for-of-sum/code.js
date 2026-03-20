function sum(items) {
  let total = 0;
  for (const item of items) {
    total = total + item;
  }
  return total;
}
console.log(sum(numbers));
