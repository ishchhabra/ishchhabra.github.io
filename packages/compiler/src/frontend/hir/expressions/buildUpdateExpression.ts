import type { UpdateExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BinaryExpressionOp,
  LiteralOp,
  LoadContextOp,
  LoadLocalOp,
  Value,
  StoreContextOp,
  StoreLocalOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { throwTDZAccessError } from "../buildIdentifier";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildMemberExpressionUpdate } from "./buildMemberExpression";

export function buildUpdateExpression(
  node: UpdateExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const argument = node.argument;
  if (argument.type === "MemberExpression") {
    return buildMemberExpressionUpdate(
      node,
      argument,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );
  }
  if (argument.type !== "Identifier") {
    throw new Error(`Unsupported argument type: ${argument.type}`);
  }

  const declarationId = functionBuilder.getDeclarationId(argument.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Variable accessed before declaration: ${argument.name}`);
  }

  if (functionBuilder.isDeclarationInTDZ(declarationId)) {
    throwTDZAccessError(functionBuilder.getDeclarationSourceName(declarationId) ?? argument.name);
  }

  const bindingPlace = environment.getDeclarationBinding(declarationId);
  if (bindingPlace === undefined) {
    throw new Error(`Unable to find the binding for ${argument.name} (${declarationId})`);
  }

  const isContext = environment.contextDeclarationIds.has(declarationId);
  const isCaptured = !functionBuilder.isOwnDeclaration(declarationId);

  let contextPlace: Value | undefined;
  if (isContext && isCaptured) {
    functionBuilder.captures.set(declarationId, bindingPlace);
    if (!functionBuilder.captureParams.has(declarationId)) {
      const paramIdentifier = environment.createValue(declarationId);
      functionBuilder.captureParams.set(declarationId, paramIdentifier);
    }
    contextPlace = functionBuilder.captureParams.get(declarationId)!;
  } else if (isContext) {
    contextPlace = bindingPlace;
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId)!;
  const originalPlace = isContext ? contextPlace : latestDeclaration.value;
  if (originalPlace === undefined) {
    throw new Error(`Unable to find the place for ${argument.name} (${declarationId})`);
  }

  // For postfix operations, the "old value" is the pre-mutation SSA value.
  // We express it as a plain LoadLocal whose SSA result is the postfix's
  // return place. If that result outlives the later `StoreLocal(assignment)`
  // in this block, `ValueMaterializationPass` will materialize it into a
  // `const $snap = src` binding before codegen. When the result is unused
  // or entirely dies before the store, no materialization happens — clean
  // output without a dead const declaration.
  let oldValLoadPlace = originalPlace;
  if (!node.prefix) {
    oldValLoadPlace = environment.createValue();
    functionBuilder.addOp(
      environment.createOperation(
        isContext ? LoadContextOp : LoadLocalOp,
        oldValLoadPlace,
        originalPlace,
      ),
    );
  }

  let lvalPlace: Value;
  if (isContext) {
    lvalPlace = originalPlace;
  } else {
    lvalPlace = bindingPlace;
  }

  // Build the binary expression inline instead of creating a synthetic path.
  // Load the argument value.
  const argLoadPlace = environment.createValue(declarationId);
  functionBuilder.addOp(
    environment.createOperation(
      isContext ? LoadContextOp : LoadLocalOp,
      argLoadPlace,
      originalPlace,
    ),
  );

  // Create literal 1
  const onePlace = environment.createValue();
  functionBuilder.addOp(environment.createOperation(LiteralOp, onePlace, 1));

  // Compute value +/- 1
  const isIncrement = node.operator === "++";
  const valuePlace = environment.createValue();
  functionBuilder.addOp(
    environment.createOperation(
      BinaryExpressionOp,
      valuePlace,
      isIncrement ? "+" : "-",
      argLoadPlace,
      onePlace,
    ),
  );

  const place = environment.createValue();
  const instruction = isContext
    ? environment.createOperation(StoreContextOp, place, lvalPlace, valuePlace, "let", "assignment")
    : environment.createOperation(
        StoreLocalOp,
        place,
        lvalPlace,
        valuePlace,
        "const",
        "assignment",
      );
  functionBuilder.addOp(instruction);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, lvalPlace);

  if (node.prefix) {
    // For prefix (++i), return a LoadLocal of the stored value so codegen
    // references the named variable ($0_1) instead of re-emitting the
    // binary expression.
    const loadPlace = environment.createValue(declarationId);
    functionBuilder.addOp(
      environment.createOperation(isContext ? LoadContextOp : LoadLocalOp, loadPlace, lvalPlace),
    );
    return loadPlace;
  }
  return oldValLoadPlace;
}
