function countKeys(obj) {
  let count = 0;
  for (const key in obj) {
    count = count + 1;
  }
  return count;
}
console.log(countKeys(myObj));
