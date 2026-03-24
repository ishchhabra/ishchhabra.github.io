function createMeta(path) {
  const meta = [{ name: "title" }];
  const links =
    path !== undefined
      ? [{ rel: "canonical", href: `/${path.startsWith("/") ? path : path}` }]
      : undefined;
  return { meta, ...(links && { links }) };
}
console.log(createMeta("/about"));
