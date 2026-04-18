function $0() {
  async function $1() {
    const $5 = await getMarkdown({
      data: $2,
    });
    $3 = $5;
  }
  const $2 = "test";
  let $3 = "";
  const $4 = () => {
    if (!$3) {
      void $1();
    }
  };
  $4();
}
