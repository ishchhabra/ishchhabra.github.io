const a = function a() {
  let d = 0;
  const e = () => {
    const $6_0 = d;
    d = d + 1;
    return $6_0;
  };
  const f = () => d;
  e();
  return f();
};
