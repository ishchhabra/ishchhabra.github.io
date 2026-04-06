import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import {
  ForInStructure,
  JumpTerminal,
  Place,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentLeft } from "../expressions/buildAssignmentExpression";
import { buildLVal } from "../buildLVal";

export function buildForInStatement(
  node: ESTree.ForInStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the object expression in the current block.
  const objectPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("For-in object must be a single place");
  }

  // Build the header block.
  const headerBlock = environment.createBlock();
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  functionBuilder.currentBlock = headerBlock;
  const forScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);

  // Build the iteration value from the left side.
  const left = node.left;
  let iterationValuePlace: Place;
  let bareLVal: ESTree.Pattern | undefined;

  if (left.type === "VariableDeclaration") {
    // `for (const x in obj)` — new loop-scoped variable.
    const kind = left.kind;
    if (kind !== "var" && kind !== "let" && kind !== "const") {
      throw new Error(`Unsupported variable declaration kind: ${kind}`);
    }
    const id = left.declarations[0].id;
    iterationValuePlace = buildLVal(
      id as ESTree.Pattern,
      forScope,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    ).place;
  } else {
    // `for (x in obj)` — assignment to existing variable.
    iterationValuePlace = buildLVal(
      left as ESTree.Pattern,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
      null,
    ).place;
    bareLVal = left as ESTree.Pattern;
  }

  // Build the body block.
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  functionBuilder.currentBlock = bodyBlock;

  // For bare LVal, copy the iteration value into new version(s) of the
  // outer variable(s) at the start of the body.
  if (bareLVal !== undefined) {
    const { place: outerPlace, instructions } = buildAssignmentLeft(
      bareLVal,
      node as any,
      scope,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    const storePlace = environment.createPlace(
      environment.createIdentifier(undefined, scope.allocateName()),
    );
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        storePlace,
        outerPlace,
        iterationValuePlace,
        "const",
        [],
      ),
    );

    for (const instr of instructions) {
      functionBuilder.addInstruction(instr);
    }
  }

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: headerBlock.id,
  });
  buildNode(node.body, forScope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  const bodyBlockTerminus = functionBuilder.currentBlock;

  // Set the jump terminal for the current block to the header block.
  currentBlock.terminal = new JumpTerminal(
    makeInstructionId(functionBuilder.environment.nextInstructionId++),
    headerBlock.id,
  );

  // Set the jump terminal for the body block to create a back edge (unless the body
  // already ended with break/return/throw, which owns the terminal).
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new JumpTerminal(
      makeInstructionId(functionBuilder.environment.nextInstructionId++),
      headerBlock.id,
    );
  }

  // Register the ForInStructure on the header block.
  functionBuilder.structures.set(
    headerBlock.id,
    new ForInStructure(
      headerBlock.id,
      iterationValuePlace,
      objectPlace,
      bodyBlock.id,
      exitBlock.id,
      label,
    ),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
