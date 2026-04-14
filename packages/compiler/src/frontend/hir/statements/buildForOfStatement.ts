import type * as AST from "../../estree";
import type { ForOfStatement, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  createOperationId,
  type DestructureTarget,
  ForOfOp,
  ObjectDestructureOp,
  Place,
  Region,
  StoreContextOp,
  StoreLocalOp,
  YieldOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildOwnedBody } from "./buildOwnedBody";

/**
 * Lower a JS `for (x of iterable) { body }` to a textbook MLIR
 * `ForOfOp`. The op is inlined into its parent block; after it,
 * control continues with the next op in the parent block.
 */
export function buildForOfStatement(
  node: ForOfStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const parentBlock = functionBuilder.currentBlock;

  const iterablePlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (iterablePlace === undefined || Array.isArray(iterablePlace)) {
    throw new Error("For-of iterable must be a single place");
  }

  const forScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);

  const left = node.left;
  let iterationValuePlace: Place;
  let iterationTarget: DestructureTarget;
  let bareLVal: AST.Pattern | MemberExpression | undefined;

  if (left.type === "VariableDeclaration") {
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
    bareLVal = left as AST.Pattern | MemberExpression;
    iterationTarget = buildLVal(bareLVal, scope, functionBuilder, moduleBuilder, environment, {
      kind: "assignment",
    });
    iterationValuePlace =
      iterationTarget.kind === "binding"
        ? iterationTarget.place
        : environment.createPlace(environment.createIdentifier());
  }

  const bodyRegion = new Region([]);
  const bodyBlock = environment.createBlock();
  functionBuilder.withStructureRegion(bodyRegion, () => {
    functionBuilder.addBlock(bodyBlock);
    functionBuilder.currentBlock = bodyBlock;

    if (bareLVal !== undefined) {
      emitLoopIterationAssignment(
        iterationTarget,
        iterationValuePlace,
        functionBuilder,
        environment,
      );
    }

    functionBuilder.controlStack.push({
      kind: "loop",
      label,
      breakTarget: undefined,
      continueTarget: undefined,
      structured: true,
    });
    buildOwnedBody(node.body, forScope, functionBuilder, moduleBuilder, environment);
    functionBuilder.controlStack.pop();

    if (functionBuilder.currentBlock.terminal === undefined) {
      functionBuilder.currentBlock.terminal = new YieldOp(
        createOperationId(environment),
        [],
      );
    }
  });

  const forOfOp = new ForOfOp(
    createOperationId(environment),
    iterationValuePlace,
    iterationTarget,
    iterablePlace,
    node.await,
    bodyRegion,
    label,
  );
  parentBlock.appendOp(forOfOp);
  functionBuilder.currentBlock = parentBlock;
  return undefined;
}

function emitLoopIterationAssignment(
  target: DestructureTarget,
  valuePlace: Place,
  functionBuilder: FuncOpBuilder,
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
