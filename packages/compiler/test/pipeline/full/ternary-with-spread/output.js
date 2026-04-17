function $0_0($1_0) {
  const $2_0 = [
    {
      name: "title",
    },
  ];
  let $29_0 = undefined;
  if ($1_0 !== undefined) {
    let $23_0 = undefined;
    const $51_0 = [
      {
        rel: "canonical",
        href: `/${$1_0.startsWith("/") ? $1_0 : $1_0}`,
      },
    ];
    $29_0 = $51_0;
  } else {
    $29_0 = undefined;
  }
  const $3_0 = $29_0;
  return {
    meta: $2_0,
    ...($3_0 && {
      links: $3_0,
    }),
  };
}
console.log($0_0("/about"));
