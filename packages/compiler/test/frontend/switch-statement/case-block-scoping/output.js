const $0_0 = function $0_0($2_0) {
  switch ($2_0.type) {
    case "comment": {
      const ref = $2_0;
      return {
        type: "comment",
        value: ref.data,
      };
    }
    case "text": {
      const ref = $2_0;
      return {
        type: "text",
        value: ref.value,
      };
    }
    default: {
      const ref = $2_0;
      return {
        type: "element",
        tag: ref.tagName,
      };
    }
  }
};
export const result = $0_0({
  type: "text",
  value: "hello",
});
