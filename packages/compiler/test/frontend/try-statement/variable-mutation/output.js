const a = function a(a) {
  let d = "default";
  let j = undefined;
  j = d;
  try {
    d = JSON.parse(a);
    j = d;
  } catch (g) {
    a = "error";
    j = a;
  }
  return j;
};
