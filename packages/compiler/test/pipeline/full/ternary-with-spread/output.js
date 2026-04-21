function $0($1) {
  let $29 = undefined;
  if ($1 !== undefined) {
    const $57 = $1.startsWith("/");
    let $23 = undefined;
    const $59 = [
      {
        rel: "canonical",
        href: `/${$57 ? $1 : $1}`,
      },
    ];
    $29 = $59;
  } else {
    $29 = undefined;
  }
  return {
    meta: [
      {
        name: "title",
      },
    ],
    ...($29 && {
      links: $29,
    }),
  };
}
console.log($0("/about"));
