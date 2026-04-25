function $0($1) {
  let $15;
  let $24;
  let $37;
  if ($1 !== undefined) {
    if ($1.startsWith("/")) {
      $24 = $1;
    } else {
      $24 = $1;
    }
    const $61 = [
      {
        rel: "canonical",
        href: `/${$24}`,
      },
    ];
    $15 = $61;
  } else {
    $15 = undefined;
  }
  if ($15) {
    const $63 = {
      links: $15,
    };
    $37 = $63;
  } else {
    $37 = $15;
  }
  return {
    meta: [
      {
        name: "title",
      },
    ],
    ...$37,
  };
}
console.log($0("/about"));
