function product(items) {
  let result = 1;
  for (const item of items) {
    result = result * item;
  }
  return result;
}
console.log(product(numbers));
