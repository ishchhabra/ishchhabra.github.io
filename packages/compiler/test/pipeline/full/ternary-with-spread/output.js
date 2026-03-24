function $0_0($1_0) {
  const $2_0 = [
    {
      name: "title",
    },
  ];
  const $3_0 =
    $1_0 !== undefined
      ? [
          {
            rel: "canonical",
            href: `/${$1_0.startsWith("/") ? $1_0 : $1_0}`,
          },
        ]
      : undefined;
  return {
    meta: $2_0,
    ...($3_0 && {
      links: $3_0,
    }),
  };
}
console.log($0_0("/about"));
