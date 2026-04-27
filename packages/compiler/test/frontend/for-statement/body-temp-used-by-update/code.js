let hash = 0;
for (let i = 0; i < 2; i++) {
  const nextHash = hash + 10;
  hash = nextHash;
}
console.log(hash);
