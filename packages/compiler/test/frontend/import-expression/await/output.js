const a = async function a() {
  const b = await import("./module");
  return b["default"];
};
