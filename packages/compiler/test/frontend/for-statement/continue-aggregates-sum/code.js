// If `continue` skipped the update and jumped to the test, i would stay 5 and this loop would never finish.
let sum = 0;
for (let i = 0; i < 10; i++) {
  if (i === 5) continue;
  sum = sum + i;
}
