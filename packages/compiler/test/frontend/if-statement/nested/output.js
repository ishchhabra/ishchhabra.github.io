const d = 100;
if (d > 50) {
  const b = 75;
  if (b > d) {
    const d = b + 10;
  } else {
    const d = d - 5;
  }
} else {
  const b = 25;
  if (b < d) {
    const d = b * 2;
  } else {
    const d = b / 2;
  }
}
const p = d;
