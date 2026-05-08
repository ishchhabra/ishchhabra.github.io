/** @type {import('rolldown').RolldownOptions} */
const config = {
  input: {
    "compile/index": "src/compile/index.ts",
    "vite/index": "src/vite/index.ts",
  },
  external: [/^node:/, "esrap", "oxc-parser", "vite"],
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    entryFileNames: "[name].js",
    chunkFileNames: "chunks/[name]-[hash].js",
  },
};

export default config;
