import type { UpdateExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  BinaryExpressionInstruction,
  DeclareLocalInstruction,
  LiteralInstruction,
  LoadContextInstruction,
  LoadLocalInstruction,
  Place,
  StoreContextInstruction,
  StoreLocalInstruction,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { throwTDZAccessError } from "../buildIdentifier";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildMemberExpressionUpdate } from "./buildMemberExpression";

export function buildUpdateExpression(
  node: UpdateExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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

  let contextPlace: Place | undefined;
  if (isContext && isCaptured) {
    functionBuilder.captures.set(declarationId, bindingPlace);
    if (!functionBuilder.captureParams.has(declarationId)) {
      const paramIdentifier = environment.createIdentifier(declarationId);
      functionBuilder.captureParams.set(declarationId, environment.createPlace(paramIdentifier));
    }
    contextPlace = functionBuilder.captureParams.get(declarationId)!;
  } else if (isContext) {
    contextPlace = bindingPlace;
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId)!;
  const originalPlace = isContext
    ? contextPlace
    : environment.places.get(latestDeclaration.placeId);
  if (originalPlace === undefined) {
    throw new Error(`Unable to find the place for ${argument.name} (${declarationId})`);
  }

  // For postfix operations, snapshot the original value into a temporary
  // so that codegen emits a distinct variable for the pre-increment value.
  // Without this, in loops with phi nodes the original place gets reassigned
  // before codegen can read the pre-increment value.
  let oldValLoadPlace = originalPlace;
  if (!node.prefix) {
    const oldValBinding = environment.createIdentifier();
    const oldValBindingPlace = environment.createPlace(oldValBinding);
    functionBuilder.addInstruction(
      environment.createInstruction(DeclareLocalInstruction, oldValBindingPlace, "const"),
    );
    const oldValStorePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        oldValStorePlace,
        oldValBindingPlace,
        originalPlace,
        "const",
        "declaration",
      ),
    );
    oldValLoadPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(LoadLocalInstruction, oldValLoadPlace, oldValBindingPlace),
    );
  }

  let lvalPlace: Place;
  if (isContext) {
    lvalPlace = originalPlace;
  } else {
    lvalPlace = bindingPlace;
  }

  // Build the binary expression inline instead of creating a synthetic path.
  // Load the argument value.
  const argLoadIdentifier = environment.createIdentifier(declarationId);
  const argLoadPlace = environment.createPlace(argLoadIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      isContext ? LoadContextInstruction : LoadLocalInstruction,
      argLoadPlace,
      originalPlace,
    ),
  );

  // Create literal 1
  const onePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(environment.createInstruction(LiteralInstruction, onePlace, 1));

  // Compute value +/- 1
  const isIncrement = node.operator === "++";
  const valuePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      BinaryExpressionInstruction,
      valuePlace,
      isIncrement ? "+" : "-",
      argLoadPlace,
      onePlace,
    ),
  );

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = isContext
    ? environment.createInstruction(
        StoreContextInstruction,
        place,
        lvalPlace,
        valuePlace,
        "let",
        "assignment",
      )
    : environment.createInstruction(
        StoreLocalInstruction,
        place,
        lvalPlace,
        valuePlace,
        "const",
        "assignment",
      );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclaration(declarationId, functionBuilder.currentBlock.id, lvalPlace.id);

  if (node.prefix) {
    // For prefix (++i), return a LoadLocal of the stored value so codegen
    // references the named variable ($0_1) instead of re-emitting the
    // binary expression.
    const loadIdentifier = environment.createIdentifier(declarationId);
    const loadPlace = environment.createPlace(loadIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(
        isContext ? LoadContextInstruction : LoadLocalInstruction,
        loadPlace,
        lvalPlace,
      ),
    );
    return loadPlace;
  }
  return oldValLoadPlace;
}
