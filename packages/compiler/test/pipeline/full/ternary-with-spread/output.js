const a = function a(a) {
  const i = [
    {
      name: "title",
    },
  ];
  const Q =
    a !== undefined
      ? [
          {
            rel: "canonical",
            href: `/${a.startsWith("/") ? a : a}`,
          },
        ]
      : undefined;
  return {
    meta: i,
    ...(Q && {
      links: Q,
    }),
  };
};
console.log(a("/about"));
