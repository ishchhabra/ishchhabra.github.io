const a = function a(a) {
  switch (a.type) {
    case "comment": {
      const c = a;
      return {
        type: "comment",
        value: c.data,
      };
    }
    case "text": {
      const c = a;
      return {
        type: "text",
        value: c.value,
      };
    }
    default: {
      const c = a;
      return {
        type: "element",
        tag: c.tagName,
      };
    }
  }
};
export const result = a({
  type: "text",
  value: "hello",
});
