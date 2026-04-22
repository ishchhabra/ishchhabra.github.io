function $0($2) {
  switch ($2.type) {
    case "comment":
      return {
        type: "comment",
        value: $2.data,
      };
    case "text":
      return {
        type: "text",
        value: $2.value,
      };
    default:
      return {
        type: "element",
        tag: $2.tagName,
      };
  }
}
const $1 = $0({
  type: "text",
  value: "hello",
});
export { $1 as result };
