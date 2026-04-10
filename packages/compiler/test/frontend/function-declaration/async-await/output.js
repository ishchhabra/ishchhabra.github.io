function $0_0() {
  async function $1_0() {
    const $5_0 = await getMarkdown({
      data: $2_0,
    });
    $3_0 = $5_0;
  }
  const $2_0 = "test";
  let $3_0 = "";
  const $4_0 = () => {
    if (!$3_0) {
      void $1_0();
    }
  };
  $4_0();
}
