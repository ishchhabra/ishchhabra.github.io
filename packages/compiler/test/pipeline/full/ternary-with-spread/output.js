function $0($1) {
  const $2 = [
    {
      name: "title",
    },
  ];
  let $29 = undefined;
  if ($1 !== undefined) {
    let $23 = undefined;
    const $57 = [
      {
        rel: "canonical",
        href: `/${$1.startsWith("/") ? $1 : $1}`,
      },
    ];
    $29 = $57;
  } else {
    $29 = undefined;
  }
  const $3 = $29;
  return {
    meta: $2,
    ...($3 && {
      links: $3,
    }),
  };
}
console.log($0("/about"));
