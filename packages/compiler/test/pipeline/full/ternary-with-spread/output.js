function $0_0($1_0) {
  return {
    meta: [
      {
        name: "title",
      },
    ],
    ...(($1_0 !== undefined
      ? [
          {
            rel: "canonical",
            href: `/${$1_0.startsWith("/") ? $1_0 : $1_0}`,
          },
        ]
      : undefined) && {
      links:
        $1_0 !== undefined
          ? [
              {
                rel: "canonical",
                href: `/${$1_0.startsWith("/") ? $1_0 : $1_0}`,
              },
            ]
          : undefined,
    }),
  };
}
console.log($0_0("/about"));
