import type { ExportDefaultDeclaration } from "oxc-parser";

import { ExportDefaultValueOp } from "../../ir/ops/modules/ExportDefaultValueOp";
import { lowerClass } from "../classes/lowerClass";
import { lowerExpression } from "../expressions/lowerExpression";
import { lowerFunctionExpression } from "../expressions/lowerFunctionExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerClassDeclaration } from "../statements/lowerClassDeclaration";

/**
 * Lowers source forms that export a default runtime value.
 *
 * Named default function/class declarations are handled as declarations during
 * declaration instantiation and represented by `ModuleDefaultLocalExport`.
 */
export function lowerDefaultExport(
  builder: FunctionIRBuilder,
  statement: ExportDefaultDeclaration,
): void {
  const declaration = statement.declaration;

  if (declaration.type === "FunctionDeclaration") {
    if (declaration.id !== null) return;

    return exportDefaultValue(builder, lowerFunctionExpression(builder, declaration));
  }

  if (declaration.type === "ClassDeclaration") {
    if (declaration.id !== null) {
      return lowerClassDeclaration(builder, declaration);
    }

    return exportDefaultValue(builder, lowerClass(builder, declaration));
  }

  if (declaration.type === "TSInterfaceDeclaration") {
    throw new Error("Type-only default exports are not supported");
  }

  exportDefaultValue(builder, lowerExpression(builder, declaration));
}

function exportDefaultValue(
  builder: FunctionIRBuilder,
  value: ReturnType<typeof lowerExpression>,
): void {
  builder.addModuleExport({ kind: "default-value", value });
  builder.emit(new ExportDefaultValueOp(builder.operationId(), value));
}
