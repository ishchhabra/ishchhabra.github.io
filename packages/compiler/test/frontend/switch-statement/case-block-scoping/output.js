function $0_0($2_0) {
  switch ($2_0.type) {
    case "comment": {
      const $24_0 = $2_0;
      return {
        type: "comment",
        value: $24_0.data,
      };
    }
    case "text": {
      const $15_0 = $2_0;
      return {
        type: "text",
        value: $15_0.value,
      };
    }
    default: {
      const $6_0 = $2_0;
      return {
        type: "element",
        tag: $6_0.tagName,
      };
    }
  }
}
const $1_0 = $0_0({
  type: "text",
  value: "hello",
});
export { $1_0 as result };
