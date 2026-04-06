const a = function a(a) {
  const d = [
    {
      name: "title",
    },
  ];
  const e =
    a !== undefined
      ? [
          {
            rel: "canonical",
            href: `/${a.startsWith("/") ? a : a}`,
          },
        ]
      : undefined;
  return {
    meta: d,
    ...(e && {
      links: e,
    }),
  };
};
console.log(a("/about"));
