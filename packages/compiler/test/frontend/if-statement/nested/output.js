const c = 100;
if (c > 50) {
  const b = 75;
  if (b > c) {
    const b = b + 10;
  } else {
    const b = c - 5;
  }
} else {
  const b = 25;
  if (b < c) {
    const b = b * 2;
  } else {
    const b = b / 2;
  }
}
const d = c;
