import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import {
  BranchTerminal,
  createInstructionId,
  DeclareLocalInstruction,
  JumpTerminal,
  LiteralInstruction,
  Place,
  StoreLocalInstruction,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildNode } from "../buildNode";

/**
 * Builds a place for a conditional expression.
 *
 * Lowers a conditional expression `test ? consequent : alternate` into an
 * if statement, with a temporary variable to store the result of the
 * conditional expression.
 */
export function buildConditionalExpression(
  node: ESTree.ConditionalExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);
  const testPlace = buildNode(node.test, scope, functionBuilder, moduleBuilder, environment);
  if (testPlace === undefined || Array.isArray(testPlace)) {
    throw new Error("Conditional expression test must be a single place");
  }

  const currentBlock = functionBuilder.currentBlock;
  // When lowering a conditional expression to an if statement, we need to
  // create a temporary identifier to store the result of the conditional
  // expression in case it is used as value somewhere (ex: in a StoreLocal).
  const resultPlace = buildTemporaryIdentifier(scope, functionBuilder, environment);

  // Create the join block.
  const joinBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(joinBlock.id, joinBlock);

  // Build the consequent block.
  const consequentBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(consequentBlock.id, consequentBlock);

  functionBuilder.currentBlock = consequentBlock;
  buildBranchExpression(
    node.consequent,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    resultPlace,
  );

  // After building the consequent block, we need to set the terminal
  // from the last block to the join block.
  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    joinBlock.id,
  );

  // Build the alternate block.
  const alternateBlock = environment.createBlock(scopeId);
  functionBuilder.blocks.set(alternateBlock.id, alternateBlock);

  functionBuilder.currentBlock = alternateBlock;
  buildBranchExpression(
    node.alternate,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
    resultPlace,
  );

  // After building the alternate block, we need to set the terminal
  // from the last block to the join block.
  functionBuilder.currentBlock.terminal = new JumpTerminal(
    createInstructionId(functionBuilder.environment),
    joinBlock.id,
  );

  // Set the branch terminal for the current block.
  currentBlock.terminal = new BranchTerminal(
    createInstructionId(functionBuilder.environment),
    testPlace,
    consequentBlock.id,
    alternateBlock.id,
    joinBlock.id,
  );

  functionBuilder.currentBlock = joinBlock;

  const { placeId } = environment.getLatestDeclaration(resultPlace.identifier.declarationId);
  return environment.places.get(placeId)!;
}

function buildTemporaryIdentifier(
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const bindingIdentifier = environment.createIdentifier();
  const bindingPlace = environment.createPlace(bindingIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(DeclareLocalInstruction, bindingPlace, "let"),
  );
  functionBuilder.registerDeclarationName(
    bindingIdentifier.name,
    bindingIdentifier.declarationId,
    scope,
  );
  environment.registerDeclaration(
    bindingIdentifier.declarationId,
    functionBuilder.currentBlock.id,
    bindingPlace.id,
  );

  const resultValueIdentifier = environment.createIdentifier(bindingIdentifier.declarationId);
  const resultValuePlace = environment.createPlace(resultValueIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(LiteralInstruction, resultValuePlace, undefined),
  );

  const resultIdentifier = environment.createIdentifier(bindingIdentifier.declarationId);
  const resultPlace = environment.createPlace(resultIdentifier);
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      resultPlace,
      bindingPlace,
      resultValuePlace,
      "const",
    ),
  );

  return bindingPlace;
}

function buildBranchExpression(
  node: ESTree.Expression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  resultPlace: Place,
) {
  const place = buildNode(node, scope, functionBuilder, moduleBuilder, environment);
  if (place === undefined || Array.isArray(place)) {
    throw new Error("Conditional expression consequent must be a single place");
  }

  const lvalIdentifier = environment.createIdentifier(resultPlace.identifier.declarationId);
  const lvalPlace = environment.createPlace(lvalIdentifier);
  environment.registerDeclaration(
    resultPlace.identifier.declarationId,
    functionBuilder.currentBlock.id,
    lvalPlace.id,
  );
  const storePlace = environment.createPlace(environment.createIdentifier());
  const storeInstruction = environment.createInstruction(
    StoreLocalInstruction,
    storePlace,
    lvalPlace,
    place,
    "const",
  );
  functionBuilder.addInstruction(storeInstruction);

  return place;
}
