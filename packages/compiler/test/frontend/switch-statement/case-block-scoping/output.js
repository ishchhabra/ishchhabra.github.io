function $0($2) {
  switch ($2.type) {
    case "comment":
      {
        const $7 = $2;
        return {
          type: "comment",
          value: $7.data,
        };
      }
      {
        const $18 = $2;
        return {
          type: "text",
          value: $18.value,
        };
      }
      {
        const $29 = $2;
        return {
          type: "element",
          tag: $29.tagName,
        };
      }
      break;
    case "text":
      {
        const $18 = $2;
        return {
          type: "text",
          value: $18.value,
        };
      }
      {
        const $29 = $2;
        return {
          type: "element",
          tag: $29.tagName,
        };
      }
      break;
    default:
      {
        const $29 = $2;
        return {
          type: "element",
          tag: $29.tagName,
        };
      }
      break;
  }
}
const $1 = $0({
  type: "text",
  value: "hello",
});
export { $1 as result };
