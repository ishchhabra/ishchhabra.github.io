import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

/** @type {import('rollup').RollupOptions} */
const config = {
  input: {
    cli: "src/cli.ts",
    compile: "src/compile.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    preserveModules: true,
    preserveModulesRoot: "src",
    sourcemap: true,
  },
  external: [
    /@babel\/.*/,
    "lodash-es",
    "zod",
    "commander",
    "glob",
    "oxc-parser",
    "eslint-visitor-keys",
  ],
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      outputToFilesystem: true,
      compilerOptions: {
        noEmit: true,
      },
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
  ],
};

export default config;
