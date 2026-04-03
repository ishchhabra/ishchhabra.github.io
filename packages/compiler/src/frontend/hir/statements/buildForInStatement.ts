import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  ForInStructure,
  JumpTerminal,
  Place,
  StoreLocalInstruction,
  makeInstructionId,
} from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildAssignmentLeft } from "../expressions/buildAssignmentExpression";
import { buildLVal } from "../buildLVal";

export function buildForInStatement(
  nodePath: NodePath<t.ForInStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the object expression in the current block.
  const rightPath = nodePath.get("right");
  const objectPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("For-in object must be a single place");
  }

  // Build the header block.
  const headerBlock = environment.createBlock();
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  functionBuilder.currentBlock = headerBlock;
  instantiateScopeBindings(nodePath, functionBuilder, environment, moduleBuilder);

  // Build the iteration value from the left side.
  const leftPath = nodePath.get("left");
  let iterationValuePlace: Place;
  let bareLVal: NodePath<t.LVal> | undefined;

  if (leftPath.isVariableDeclaration()) {
    // `for (const x in obj)` — new loop-scoped variable.
    const kind = leftPath.node.kind;
    if (kind !== "var" && kind !== "let" && kind !== "const") {
      throw new Error(`Unsupported variable declaration kind: ${kind}`);
    }
    const idPath = leftPath.get("declarations")[0].get("id") as NodePath<t.LVal>;
    iterationValuePlace = buildLVal(
      idPath,
      functionBuilder,
      moduleBuilder,
      environment,
      kind,
    ).place;
  } else {
    // `for (x in obj)` — assignment to existing variable.
    iterationValuePlace = buildLVal(
      leftPath as NodePath<t.LVal>,
      functionBuilder,
      moduleBuilder,
      environment,
      null,
    ).place;
    bareLVal = leftPath as NodePath<t.LVal>;
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
      nodePath as any,
      functionBuilder,
      moduleBuilder,
      environment,
    );

    const storePlace = environment.createPlace(environment.createIdentifier());
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
