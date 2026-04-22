function $0($2) {
  switch ($2.type) {
    case "comment":
      return {
        type: "comment",
        value: $2.data,
      };
    case "text":
      const $18 = $2;
      return {
        type: "text",
        value: $18.value,
      };
    default:
      const $29 = $2;
      return {
        type: "element",
        tag: $29.tagName,
      };
  }
}
const $1 = $0({
  type: "text",
  value: "hello",
});
export { $1 as result };
