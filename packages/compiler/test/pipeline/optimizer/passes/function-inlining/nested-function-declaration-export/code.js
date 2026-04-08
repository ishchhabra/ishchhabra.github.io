export const pointEnd = point('end');
export const pointStart = point('start');

function point(type) {
  return point;
  function point(node) {
    return node && node.position && node.position[type];
  }
}
