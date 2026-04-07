function $0_0() {
  async function $1_0() {
    const md = await getMarkdown({
      data: slug,
    });
    markdown = md;
  }
  const slug = "test";
  let markdown = "";
  const handler = () => {
    if (!markdown) {
      void $1_0();
    }
  };
  handler();
}
