function $0_0() {
  async function $3_0() {
    const $4_0 = await getMarkdown({
      data: $1_0,
    });
    $2_0 = $4_0;
  }
  const $1_0 = "test";
  let $2_0 = "";
  const $13_0 = () => {
    if (!$2_0) {
      void $3_0();
    }
  };
  $13_0();
}
