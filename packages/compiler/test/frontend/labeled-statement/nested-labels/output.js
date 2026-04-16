outer: for (let $0_0 = 0; $0_0 < 5; $0_0 = $0_0 + 1) {
  inner: for (let $6_0 = 0; $6_0 < 5; $6_0 = $6_0 + 1) {
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
