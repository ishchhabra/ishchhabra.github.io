const $0_0 = function $0_0() {
  const $3_0 = async function $3_0() {
    const md = await getMarkdown({
      data: slug,
    });
    markdown = md;
  };
  const slug = "test";
  let markdown = "";
  const handler = () => {
    if (!markdown) {
      void $3_0();
    }
  };
  handler();
};
