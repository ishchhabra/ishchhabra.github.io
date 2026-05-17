import type {
  BlockStatement,
  ArrowFunctionExpression,
  ForOfStatement,
  Function as OxcFunction,
  Program,
  ForInStatement,
  SwitchStatement,
} from "oxc-parser";

import type { Value } from "../../ir/core/Value";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import { CreateFunctionOp } from "../../ir/ops/functions/CreateFunctionOp";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerFunctionDeclarationBody } from "../functions/lowerFunctionDeclaration";
import type { Declaration } from "../scope/Declaration";

/**
 * Emits ECMAScript declaration-instantiation work before a scope body runs.
 */
export function lowerDeclarationInstantiation(
  builder: FunctionIRBuilder,
  owner:
    | Program
    | BlockStatement
    | OxcFunction
    | ArrowFunctionExpression
    | ForOfStatement
    | ForInStatement
    | SwitchStatement,
): void {
  const scope = builder.scopeForOwner(owner);
  const declarations = builder.instantiationForScope(scope);

  for (const declaration of declarations.functions) {
    const functionIR = lowerFunctionDeclarationBody(builder, declaration);
    const value = builder.createValue();
    const bindingValue = builder.createValue(declaration.declaration.id);

    builder.emit(new CreateFunctionOp(builder.operationId(), functionIR, value));
    builder.emit(
      functionBindingInstantiationOp(builder, declaration.declaration, value, bindingValue),
    );
  }

  for (const declaration of declarations.vars) {
    const value = builder.createValue();
    builder.emit(new ConstantOp(builder.operationId(), undefined, value));
    builder.emit(
      new InitializeBindingOp(
        builder.operationId(),
        declaration.id,
        value,
        builder.createValue(declaration.id),
      ),
    );
  }

  for (const declaration of declarations.lexicals) {
    if (declaration.kind === "import") continue;
    if (declaration.kind === "lexical") continue;

    throw new Error(`Unsupported lexical declaration instantiation: ${declaration.name}`);
  }
}

function functionBindingInstantiationOp(
  builder: FunctionIRBuilder,
  declaration: Declaration,
  value: Value,
  bindingValue: Value,
): InitializeBindingOp | StoreBindingOp {
  if (declaration.kind === "parameter") {
    return new StoreBindingOp(builder.operationId(), declaration.id, value, bindingValue);
  }

  return new InitializeBindingOp(builder.operationId(), declaration.id, value, bindingValue);
}
