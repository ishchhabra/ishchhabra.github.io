// Bug 6: foldInitialValueInBlock propagates branch-local values
// When LateCopyFolding's foldInitialValue combines with LateCopyCoalescing
// and LateCopyPropagation in a fixpoint loop, a value defined inside a
// branch arm can be propagated to the merge block where it's out of scope.

function resolve(input, fallback) {
  let result;
  if (input !== null) {
    result = input.toString();
  } else {
    result = fallback;
  }
  return result;
}

// Variant with ternary-like pattern
function normalize(value, defaultVal) {
  let normalized = defaultVal;
  if (value !== undefined) {
    normalized = value.trim();
  }
  return normalized.toLowerCase();
}

export { resolve, normalize };
