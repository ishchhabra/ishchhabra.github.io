import nodeExternals from "rollup-plugin-node-externals";
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
  plugins: [
    nodeExternals(),
    typescript({
      outputToFilesystem: true,
      compilerOptions: {
        noEmit: true,
      },
    }),
  ],
};

export default config;
