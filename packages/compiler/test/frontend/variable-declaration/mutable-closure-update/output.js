function $0() {
  let $1 = 0;
  const $2 = () => {
    const $23 = $1;
    $1 = $1 + 1;
    return $23;
  };
  const $3 = () => $1;
  $2();
  return $3();
}
