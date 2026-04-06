const a = async function a() {
  const e = await import("./module");
  return e["default"];
};
