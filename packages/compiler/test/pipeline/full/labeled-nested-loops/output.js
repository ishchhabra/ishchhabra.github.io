let $0_0 = 0;
outer: for (; $0_0 < 5; $0_0 = $0_0 + 1) {
  let $6_0 = 0;
  inner: for (; $6_0 < 5; $6_0 = $6_0 + 1) {
    if ($6_0 === 2) {
      continue inner;
    }
    if ($6_0 === 3) {
      continue outer;
    }
    if ($0_0 === 4) {
      break outer;
    }
    console.log($0_0, $6_0);
  }
}
