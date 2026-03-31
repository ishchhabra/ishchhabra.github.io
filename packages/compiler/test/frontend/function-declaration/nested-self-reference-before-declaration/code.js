function point(type) {
  return point;

  function point(node) {
    const point = (node && node.position && node.position[type]) || {};

    if (
      typeof point.line === "number" &&
      point.line > 0 &&
      typeof point.column === "number" &&
      point.column > 0
    ) {
      return {
        line: point.line,
        column: point.column,
        offset:
          typeof point.offset === "number" && point.offset > -1 ? point.offset : undefined,
      };
    }
  }
}
