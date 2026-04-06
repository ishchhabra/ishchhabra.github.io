const a = function a() {
  let e = 0;
  const h = () => {
    const a = e;
    e = e + 1;
    return a;
  };
  const k = () => e;
  h();
  return k();
};
