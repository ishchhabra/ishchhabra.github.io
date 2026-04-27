function $0($1) {
  let $14;
  let $35;
  if ($1 !== undefined) {
    $14 = [
      {
        rel: "canonical",
        href: `/${$1.startsWith("/") ? $1 : $1}`,
      },
    ];
  } else {
    $14 = undefined;
  }
  if ($14) {
    $35 = {
      links: $14,
    };
  } else {
    $35 = $14;
  }
  return {
    meta: [
      {
        name: "title",
      },
    ],
    ...$35,
  };
}
console.log($0("/about"));
