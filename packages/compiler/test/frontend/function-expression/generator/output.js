const counter = function* () {
  let i = 0;
  let $15_phi_16 = undefined;
  $15_phi_16 = i;
  while (true) {
    const $5_0 = $15_phi_16;
    i = $15_phi_16 + 1;
    yield $5_0;
    $15_phi_16 = i;
  }
};
