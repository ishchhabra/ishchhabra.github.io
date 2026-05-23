import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/test262/vitest.mjs"],
    // Test262 shell hosts do not fail a synchronous test only because evaluated
    // code creates an unhandled Promise rejection.
    onUnhandledError() {
      return false;
    },
  },
});
