import type { Class } from "oxc-parser";

import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { lowerClass } from "../classes/lowerClass";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";

export function lowerClassDeclaration(builder: FunctionIRBuilder, declaration: Class): void {
  if (declaration.id === null) {
    throw new Error("Class declaration is missing a binding name");
  }

  const classValue = lowerClass(builder, declaration);
  const binding = builder.declarationForBinding(declaration.id);

  builder.emit(
    new InitializeBindingOp(
      builder.operationId(),
      binding.id,
      classValue,
      builder.createValue(binding.id),
    ),
  );
}
