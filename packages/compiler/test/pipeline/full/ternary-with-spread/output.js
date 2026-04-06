const $0_0 = function $0_0($1_0) {
  const meta = [
    {
      name: "title",
    },
  ];
  const links =
    $1_0 !== undefined
      ? [
          {
            rel: "canonical",
            href: `/${$1_0.startsWith("/") ? $1_0 : $1_0}`,
          },
        ]
      : undefined;
  return {
    meta,
    ...(links && {
      links,
    }),
  };
};
console.log($0_0("/about"));
