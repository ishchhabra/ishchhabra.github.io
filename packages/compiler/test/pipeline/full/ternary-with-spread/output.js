function $0($1) {
  let $13 = undefined;
  let $22 = undefined;
  let $35 = undefined;
  if ($1 !== undefined) {
    if ($1.startsWith("/")) {
      $22 = $1;
    } else {
      $22 = $1;
    }
    const $61 = [
      {
        rel: "canonical",
        href: `/${$22}`,
      },
    ];
    $13 = $61;
  } else {
    $13 = undefined;
  }
  if ($13) {
    const $63 = {
      links: $13,
    };
    $35 = $63;
  } else {
    $35 = $13;
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
