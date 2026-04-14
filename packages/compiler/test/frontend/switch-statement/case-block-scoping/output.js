function $0_0($2_0) {
  switch ($2_0.type) {
    case "comment":
      {
        const $7_0 = $2_0;
        return {
          type: "comment",
          value: $7_0.data,
        };
      }
      {
        const $18_0 = $2_0;
        return {
          type: "text",
          value: $18_0.value,
        };
      }
      {
        const $29_0 = $2_0;
        return {
          type: "element",
          tag: $29_0.tagName,
        };
      }
      break;
    case "text":
      {
        const $18_0 = $2_0;
        return {
          type: "text",
          value: $18_0.value,
        };
      }
      {
        const $29_0 = $2_0;
        return {
          type: "element",
          tag: $29_0.tagName,
        };
      }
      break;
    default:
      {
        const $29_0 = $2_0;
        return {
          type: "element",
          tag: $29_0.tagName,
        };
      }
      break;
  }
}
const $1_0 = $0_0({
  type: "text",
  value: "hello",
});
export { $1_0 as result };
