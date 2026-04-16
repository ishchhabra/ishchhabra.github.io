outer: for (let $0_0 = 0; $0_0 < 3; $0_0 = $0_0 + 1) {
  for (let $6_0 = 0; $6_0 < 3; $6_0 = $6_0 + 1) {
    if ($6_0 === 1) {
      continue outer;
    }
    console.log($0_0, $6_0);
  }
}
