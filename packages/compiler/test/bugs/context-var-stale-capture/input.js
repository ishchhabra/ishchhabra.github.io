// Bug 4: Context variable captures reference stale identifiers after SSA
// After SSA optimization, the arrow functions' writes to `isReset` use a
// stale capture parameter name that doesn't match the outer variable's
// current name. Reads work correctly but writes produce ReferenceErrors.

function createValue() {
  let isReset = false;
  return {
    clearReset: () => {
      isReset = false;
    },
    reset: () => {
      isReset = true;
    },
    isReset: () => {
      return isReset;
    },
  };
}

const defaultValue = createValue();
export { defaultValue };
