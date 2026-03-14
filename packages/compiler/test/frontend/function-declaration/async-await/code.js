function Component() {
  const slug = "test";
  let markdown = "";

  async function loadMarkdown() {
    const md = await getMarkdown({ data: slug });
    markdown = md;
  }

  const handler = () => {
    if (!markdown) void loadMarkdown();
  };

  handler();
}
