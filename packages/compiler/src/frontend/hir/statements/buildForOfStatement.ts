import type * as AST from "../../estree";
import type { ForOfStatement, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  createOperationId,
  type DestructureTarget,
  ForOfOp,
  JumpOp,
  ObjectDestructureOp,
  Place,
  Region,
  StoreContextOp,
  StoreLocalOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildForOfStatement(
  node: ForOfStatement,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const currentBlock = functionBuilder.currentBlock;

  // Build the iterable expression in the current block.
  const iterablePlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (iterablePlace === undefined || Array.isArray(iterablePlace)) {
    throw new Error("For-of iterable must be a single place");
  }

  // Build the header block.
  const forScope = functionBuilder.scopeFor(node);
  const forScopeId = functionBuilder.lexicalScopeIdFor(forScope, "for");
  const scopeId = functionBuilder.lexicalScopeIdFor(scope);
  const headerBlock = environment.createBlock(forScopeId);
  functionBuilder.addBlock(headerBlock);

  functionBuilder.currentBlock = headerBlock;
  instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);

  // Build the iteration value from the left side.
  const left = node.left;
  let iterationValuePlace: Place;
  let iterationTarget: DestructureTarget;
  let bareLVal: AST.Pattern | MemberExpression | undefined;

  if (left.type === "VariableDeclaration") {
    // `for (const x of arr)` — new loop-scoped variable.
    const kind = left.kind;
    if (kind !== "var" && kind !== "let" && kind !== "const") {
      throw new Error(`Unsupported variable declaration kind: ${kind}`);
    }
    const id = left.declarations[0].id;
    iterationTarget = buildLVal(
      id as AST.Pattern,
      forScope,
      functionBuilder,
      moduleBuilder,
      environment,
      { kind: "declaration", declarationKind: kind },
    );
    iterationValuePlace = environment.createPlace(environment.createIdentifier());
  } else {
    // `for (x of arr)` or `for ({a, b} of arr)` — assignment to existing variable(s).
    bareLVal = left as AST.Pattern | MemberExpression;
    iterationTarget = buildLVal(bareLVal, scope, functionBuilder, moduleBuilder, environment, {
      kind: "assignment",
    });
    iterationValuePlace =
      iterationTarget.kind === "binding"
        ? iterationTarget.place
        : environment.createPlace(environment.createIdentifier());
  }

  // Build the body block. When the body is a BlockStatement, use its
  // scope so it merges with the body block — the loop syntax provides { }.
  const bodyScope =
    node.body.type === "BlockStatement" ? functionBuilder.scopeFor(node.body) : forScope;
  const bodyScopeId = functionBuilder.lexicalScopeIdFor(bodyScope);
  const bodyBlock = environment.createBlock(bodyScopeId);
  functionBuilder.addBlock(bodyBlock);

  functionBuilder.currentBlock = bodyBlock;

  // For bare LVal, copy the iteration value into the outer target at the
  // start of the body.
  if (bareLVal !== undefined) {
    emitLoopIterationAssignment(iterationTarget, iterationValuePlace, functionBuilder, environment);
  }

  // Build the exit block (created early so break statements can reference it).
  const exitBlock = environment.createBlock(scopeId);
  functionBuilder.addBlock(exitBlock);

  // The nested region owns every block created by `buildOwnedBody` —
  // this is the MLIR-style "for-of body" region. We seed it with the
  // pre-created `bodyBlock` as the entry, then push it on the region
  // stack so nested block creations get claimed by it.
  const bodyRegion = new Region([]);
  bodyRegion.moveBlockHere(bodyBlock);

  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: headerBlock.id,
    structured: true,
  });
  functionBuilder.withStructureRegion(bodyRegion, () => {
    buildOwnedBody(node.body, forScope, functionBuilder, moduleBuilder, environment);
  });
  functionBuilder.controlStack.pop();
  const bodyBlockTerminus = functionBuilder.currentBlock;

  // Set the jump terminal for the current block to the header block.
  currentBlock.terminal = new JumpOp(createOperationId(environment), headerBlock.id);

  // Set the jump terminal for the body block to create a back edge (unless the body
  // already ended with break/return/throw, which owns the terminal).
  if (bodyBlockTerminus.terminal === undefined) {
    bodyBlockTerminus.terminal = new JumpOp(createOperationId(environment), headerBlock.id);
  }

  // Register the ForOfOp on the header block. The body region owns the
  // loop body as a nested MLIR-style region — its entry block IS the
  // body block, so no separate `body: BlockId` field is needed.
  functionBuilder.structures.set(
    headerBlock.id,
    new ForOfOp(
      createOperationId(environment),
      headerBlock.id,
      iterationValuePlace,
      iterationTarget,
      iterablePlace,
      exitBlock.id,
      node.await,
      bodyRegion,
      label,
    ),
  );

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}

function emitLoopIterationAssignment(
  target: DestructureTarget,
  valuePlace: Place,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): void {
  if (target.kind === "binding") {
    const StoreInstruction = target.storage === "context" ? StoreContextOp : StoreLocalOp;
    functionBuilder.addOp(
      environment.createOperation(
        StoreInstruction,
        environment.createPlace(environment.createIdentifier()),
        target.place,
        valuePlace,
        "const",
        "assignment",
      ),
    );
    return;
  }

  if (target.kind === "array") {
    functionBuilder.addOp(
      environment.createOperation(
        ArrayDestructureOp,
        environment.createPlace(environment.createIdentifier()),
        target.elements,
        valuePlace,
        "assignment",
        null,
      ),
    );
    return;
  }

  if (target.kind === "object") {
    functionBuilder.addOp(
      environment.createOperation(
        ObjectDestructureOp,
        environment.createPlace(environment.createIdentifier()),
        target.properties,
        valuePlace,
        "assignment",
        null,
      ),
    );
    return;
  }

  throw new Error(`Unsupported for-of assignment target: ${target.kind}`);
}
