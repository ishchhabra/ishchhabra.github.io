import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  BindingIdentifierInstruction,
  ForOfStructure,
  JumpTerminal,
  Place,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentLeft } from "../expressions/buildAssignmentExpression";
import { buildVariableDeclaratorLVal } from "./buildVariableDeclaration";

export function buildForOfStatement(
  nodePath: NodePath<t.ForOfStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the iterable expression in the current block.
  const rightPath = nodePath.get("right");
  const iterablePlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (iterablePlace === undefined || Array.isArray(iterablePlace)) {
    throw new Error("For-of iterable must be a single place");
  }

  // Build the header block.
  const headerBlock = environment.createBlock();
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  functionBuilder.currentBlock = headerBlock;
  buildBindings(nodePath, functionBuilder, environment);

  // Build the iteration value from the left side.
  const leftPath = nodePath.get("left");
  let iterationValuePlace: Place;
  let bareLVal: NodePath<t.LVal> | undefined;

  if (leftPath.isVariableDeclaration()) {
    // `for (const x of arr)` — new loop-scoped variable.
    const idPath = leftPath.get("declarations")[0].get("id") as NodePath<t.LVal>;
    ({ place: iterationValuePlace } = buildVariableDeclaratorLVal(
      idPath,
      functionBuilder,
      moduleBuilder,
      environment,
    ));
  } else {
    // `for (x of arr)` or `for ({a, b} of arr)` — assignment to existing variable(s).
    // Create a fresh loop-scoped place for the iteration value (own declarationId).
    // The body will copy it into new version(s) of the outer variable(s) via StoreLocal.
    const iterIdentifier = environment.createIdentifier();
    iterationValuePlace = environment.createPlace(iterIdentifier);
    functionBuilder.addInstruction(
      environment.createInstruction(BindingIdentifierInstruction, iterationValuePlace, leftPath),
    );
    bareLVal = leftPath as NodePath<t.LVal>;
  }

  // Build the body block.
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  functionBuilder.currentBlock = bodyBlock;

  // For bare LVal, copy the iteration value into new version(s) of the
  // outer variable(s) at the start of the body. buildAssignmentLeft handles
  // identifiers, array patterns, and object patterns.
  if (bareLVal !== undefined) {
    const {
      place: outerPlace,
      instructions,
      identifiers,
    } = buildAssignmentLeft(bareLVal, nodePath as any, functionBuilder, moduleBuilder, environment);

    const storePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        storePlace,
        leftPath,
        outerPlace,
        iterationValuePlace,
        "const",
        identifiers,
      ),
    );

    for (const instr of instructions) {
      functionBuilder.addInstruction(instr);
    }
  }

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  const bodyPath = nodePath.get("body");
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: headerBlock.id,
  });
  buildNode(bodyPath, functionBuilder, moduleBuilder, environment);
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

  // Register the ForOfStructure on the header block.
  functionBuilder.structures.set(
    headerBlock.id,
    new ForOfStructure(
      headerBlock.id,
      iterationValuePlace,
      iterablePlace,
      bodyBlock.id,
      exitBlock.id,
      nodePath.node.await,
      label,
    ),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
