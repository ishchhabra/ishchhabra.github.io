function $0($1) {
  let $14;
  let $23;
  let $35;
  if ($1 !== undefined) {
    if ($1.startsWith("/")) {
      $23 = $1;
    } else {
      $23 = $1;
    }
    const $55 = [
      {
        rel: "canonical",
        href: `/${$23}`,
      },
    ];
    $14 = $55;
  } else {
    $14 = undefined;
  }
  if ($14) {
    const $56 = {
      links: $14,
    };
    $35 = $56;
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
