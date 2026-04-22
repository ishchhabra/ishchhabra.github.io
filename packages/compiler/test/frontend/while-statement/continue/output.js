while (i < 10) {
  if (skip(i)) {
    continue;
  } else {
    process(i);
    continue;
  }
}
