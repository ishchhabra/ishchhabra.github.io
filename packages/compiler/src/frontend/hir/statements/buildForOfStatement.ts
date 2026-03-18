import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import {
  createInstructionId,
  ForOfTerminal,
  JumpTerminal,
  StoreContextInstruction,
  StoreLocalInstruction,
  StorePatternInstruction,
} from "../../../ir";
import { buildBindings } from "../bindings/buildBindings";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildVariableDeclaration } from "./buildVariableDeclaration";

export function buildForOfStatement(
  nodePath: NodePath<t.ForOfStatement>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the iterable (right) expression in the current block.
  const rightPath = nodePath.get("right");
  const rightPlace = buildNode(rightPath, functionBuilder, moduleBuilder, environment);
  if (rightPlace === undefined || Array.isArray(rightPlace)) {
    throw new Error("ForOfStatement right must be a single place");
  }

  // Register bindings for the loop variable so it's available in the body.
  buildBindings(nodePath, functionBuilder, environment);

  // Build the left side. For `for (const x of items)` or `for (const [a, b] of items)`,
  // we build the full variable declaration which creates StoreLocal + bindings.
  // The ForOfTerminal stores the StoreLocal place; codegen reconstructs the declaration.
  // We set emit=false on the StoreLocal so it's not emitted as a standalone statement
  // (it will be used by the ForOfTerminal codegen instead).
  const leftPath = nodePath.get("left");
  let leftPlace;

  if (leftPath.isVariableDeclaration()) {
    const places = buildVariableDeclaration(leftPath, functionBuilder, moduleBuilder, environment);
    if (places === undefined || (Array.isArray(places) && places.length === 0)) {
      throw new Error("ForOfStatement left variable declaration must produce a place");
    }
    leftPlace = Array.isArray(places) ? places[0] : places;

    // Mark the StoreLocal as non-emitting — the for-of construct handles the declaration.
    const storeLocalInstruction = environment.placeToInstruction.get(leftPlace.id);
    if (
      storeLocalInstruction instanceof StoreLocalInstruction ||
      storeLocalInstruction instanceof StoreContextInstruction ||
      storeLocalInstruction instanceof StorePatternInstruction
    ) {
      storeLocalInstruction.emit = false;
    }
  } else {
    const place = buildNode(leftPath, functionBuilder, moduleBuilder, environment);
    if (place === undefined || Array.isArray(place)) {
      throw new Error("ForOfStatement left must be a single place");
    }
    leftPlace = place;
  }

  // Create a separate header block for the ForOfTerminal. This gives the
  // loop header two predecessors (pre-loop block + body terminus) so SSA
  // can create proper loop phis for variables modified inside the body.
  const headerBlock = environment.createBlock();
  functionBuilder.blocks.set(headerBlock.id, headerBlock);

  // Jump from the current (pre-loop) block to the header.
  currentBlock.terminal = new JumpTerminal(createInstructionId(environment), headerBlock.id);

  // Create the body block.
  const bodyBlock = environment.createBlock();
  functionBuilder.blocks.set(bodyBlock.id, bodyBlock);

  functionBuilder.currentBlock = bodyBlock;
  const bodyPath = nodePath.get("body");
  buildNode(bodyPath, functionBuilder, moduleBuilder, environment);
  const bodyBlockTerminus = functionBuilder.currentBlock;

  // Create the exit block.
  const exitBlock = environment.createBlock();
  functionBuilder.blocks.set(exitBlock.id, exitBlock);

  // Body block terminus jumps back to the header block (back edge) so that
  // SSA analysis can create loop phis for variables modified inside the body.
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new JumpTerminal(createInstructionId(environment), headerBlock.id);
  }

  // Set the ForOfTerminal on the header block.
  headerBlock.terminal = new ForOfTerminal(
    createInstructionId(environment),
    leftPlace,
    rightPlace,
    bodyBlock.id,
    exitBlock.id,
    nodePath.node.await,
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}
