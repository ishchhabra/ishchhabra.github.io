function $0($1) {
  let $29 = undefined;
  if ($1 !== undefined) {
    const $61 = $1.startsWith("/");
    let $23 = undefined;
    const $63 = [
      {
        rel: "canonical",
        href: `/${$61 ? $1 : $1}`,
      },
    ];
    $29 = $63;
  } else {
    $29 = undefined;
  }
  let $39 = undefined;
  if ($29) {
    const $65 = {
      links: $29,
    };
    $39 = $65;
  } else {
    $39 = $29;
  }
  return {
    meta: [
      {
        name: "title",
      },
    ],
    ...$39,
  };
}
console.log($0("/about"));
