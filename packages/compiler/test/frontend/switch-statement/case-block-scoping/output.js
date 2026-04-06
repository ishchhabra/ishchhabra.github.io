const a = function a(a) {
  switch (a.type) {
    case "comment": {
      const F = a;
      return {
        type: "comment",
        value: F.data,
      };
    }
    case "text": {
      const t = a;
      return {
        type: "text",
        value: t.value,
      };
    }
    default: {
      const h = a;
      return {
        type: "element",
        tag: h.tagName,
      };
    }
  }
};
export const result = a({
  type: "text",
  value: "hello",
});
