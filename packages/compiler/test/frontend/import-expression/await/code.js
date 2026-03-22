async function load() {
  const mod = await import("./module");
  return mod.default;
}
