function $0() {
  async function $1() {
    $3 = await getMarkdown({
      data: $2,
    });
  }
  const $2 = "test";
  let $3 = "";
  (() => {
    if (!$3) {
      void $1();
    }
  })();
}
