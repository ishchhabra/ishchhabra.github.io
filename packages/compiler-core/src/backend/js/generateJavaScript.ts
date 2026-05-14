import { print } from "esrap";

import type { ModuleIRBuildResult } from "../../frontend/ModuleIRBuilder";
import { program } from "./ast";
import { CodegenContext } from "./CodegenContext";
import { emitFunctionBody } from "./functions/emitFunction";
import { javascriptLanguage } from "./language";
import { emitModuleExports, emitModuleImports } from "./modules/emitModuleRecords";

export function generateJavaScript(input: ModuleIRBuildResult): string {
  const entry = input.moduleIR.entryFunction;
  if (entry === null) {
    throw new Error("Cannot generate JavaScript for module without entry function");
  }

  const context = new CodegenContext(input);
  return print(
    program([
      ...emitModuleImports(input.moduleIR),
      ...emitFunctionBody(context, entry),
      ...emitModuleExports(context, input.moduleIR),
    ]),
    javascriptLanguage(),
    {
      indent: "  ",
    },
  ).code;
}
