const a = function a(a) {
  switch (a.type) {
    case "comment": {
      const b = a;
      return {
        type: "comment",
        value: b.data,
      };
    }
    case "text": {
      const b = a;
      return {
        type: "text",
        value: b.value,
      };
    }
    default: {
      const b = a;
      return {
        type: "element",
        tag: b.tagName,
      };
    }
  }
};
export const result = a({
  type: "text",
  value: "hello",
});
