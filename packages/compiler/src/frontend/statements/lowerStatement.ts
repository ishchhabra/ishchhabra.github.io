import type { Statement } from "oxc-parser";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerEmptyStatement } from "./lowerEmptyStatement";
import { lowerBlockStatement } from "./lowerBlockStatement";
import { lowerVariableDeclaration } from "./lowerVariableDeclaration";
import { lowerReturnStatement } from "./lowerReturnStatement";
import { lowerThrowStatement } from "./lowerThrowStatement";
import { lowerIfStatement } from "./lowerIfStatement";
import { lowerWhileStatement } from "./lowerWhileStatement";
import { lowerDoWhileStatement } from "./lowerDoWhileStatement";
import { lowerExpressionStatement } from "./lowerExpressionStatement";
import { lowerBreakStatement } from "./lowerBreakStatement";
import { lowerContinueStatement } from "./lowerContinueStatement";
import { lowerForInStatement } from "./lowerForInStatement";
import { lowerForStatement } from "./lowerForStatement";
import { lowerForOfStatement } from "./lowerForOfStatement";
import { lowerLabeledStatement } from "./lowerLabeledStatement";
import { lowerSwitchStatement } from "./lowerSwitchStatement";
import { lowerTryStatement } from "./lowerTryStatement";
import { lowerDebuggerStatement } from "./lowerDebuggerStatement";
import { lowerClassDeclaration } from "./lowerClassDeclaration";
import type { StatementLoweringOptions } from "./loweringOptions";
import { lowerDefaultExport } from "../modules/lowerDefaultExport";

/**
 * Dispatches statement lowering by syntax kind.
 */
export function lowerStatement(
  builder: FunctionIRBuilder,
  statement: Statement,
  options: StatementLoweringOptions = {},
): void {
  switch (statement.type) {
    case "EmptyStatement":
      return lowerEmptyStatement(builder, statement);

    case "DebuggerStatement":
      return lowerDebuggerStatement(builder, statement);

    case "ExpressionStatement":
      return lowerExpressionStatement(builder, statement.expression);

    case "VariableDeclaration":
      return lowerVariableDeclaration(builder, statement);

    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
      return;

    case "TSEnumDeclaration":
      if (statement.declare) return;
      throw new Error("Runtime TypeScript enums require enum lowering");

    case "TSImportEqualsDeclaration":
      if (statement.importKind === "type") return;
      throw new Error("Runtime TypeScript import-equals declarations require lowering");

    case "TSModuleDeclaration":
      if (statement.declare) return;
      throw new Error("Runtime TypeScript namespaces require namespace lowering");

    case "ImportDeclaration":
      return;

    case "ExportNamedDeclaration":
      if (statement.exportKind === "type") return;
      if (statement.declaration === null) return;
      return lowerStatement(builder, statement.declaration, options);

    case "ExportDefaultDeclaration":
      return lowerDefaultExport(builder, statement);

    case "ExportAllDeclaration":
      if (statement.exportKind === "type") return;
      return;

    case "FunctionDeclaration":
      // Function declarations are emitted during declaration instantiation.
      return;

    case "ClassDeclaration":
      return lowerClassDeclaration(builder, statement);

    case "ReturnStatement":
      return lowerReturnStatement(builder, statement);

    case "ThrowStatement":
      return lowerThrowStatement(builder, statement);

    case "BreakStatement":
      return lowerBreakStatement(builder, statement);

    case "ContinueStatement":
      return lowerContinueStatement(builder, statement);

    case "LabeledStatement":
      return lowerLabeledStatement(builder, statement);

    case "BlockStatement":
      return lowerBlockStatement(builder, statement);

    case "IfStatement":
      return lowerIfStatement(builder, statement);

    case "SwitchStatement":
      return lowerSwitchStatement(builder, statement, options);

    case "TryStatement":
      return lowerTryStatement(builder, statement);

    case "WhileStatement":
      return lowerWhileStatement(builder, statement, options);

    case "DoWhileStatement":
      return lowerDoWhileStatement(builder, statement, options);

    case "ForStatement":
      return lowerForStatement(builder, statement, options);

    case "ForInStatement":
      return lowerForInStatement(builder, statement, options);

    case "ForOfStatement":
      return lowerForOfStatement(builder, statement, options);

    default:
      throw new Error(`Unsupported statement type: ${statement.type}`);
  }
}
