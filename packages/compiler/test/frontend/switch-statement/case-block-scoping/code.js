function process(node) {
  switch (node.type) {
    case "comment": {
      const ref = node;
      return { type: "comment", value: ref.data };
    }
    case "text": {
      const ref = node;
      return { type: "text", value: ref.value };
    }
    default: {
      const ref = node;
      return { type: "element", tag: ref.tagName };
    }
  }
}

export const result = process({ type: "text", value: "hello" });
