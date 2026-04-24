import type * as AST from "../../estree";
import type { ForInStatement, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  createOperationId,
  destructureTargetResults,
  type DestructureTarget,
  ForInTermOp,
  JumpTermOp,
  ObjectDestructureOp,
  Value,
  StoreContextOp,
  StoreLocalOp,
} from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildLVal } from "../buildLVal";
import { instantiateScopeBindings } from "../bindings";
import { buildNode } from "../buildNode";
import { buildOwnedBody } from "./buildOwnedBody";

export function buildForInStatement(
  node: ForInStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const objectPlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (objectPlace === undefined || Array.isArray(objectPlace)) {
    throw new Error("For-in object must be a single place");
  }
  // parentBlock captured AFTER object expr — compound objects may
  // have moved currentBlock.
  const parentBlock = functionBuilder.currentBlock;

  const forScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);

  const left = node.left;
  let iterationValuePlace: Value;
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
    iterationValuePlace =
      iterationTarget.kind === "binding" ? iterationTarget.place : environment.createValue();
  } else {
    bareLVal = left as AST.Pattern | MemberExpression;
    iterationTarget = buildLVal(bareLVal, scope, functionBuilder, moduleBuilder, environment, {
      kind: "assignment",
    });
    iterationValuePlace =
      iterationTarget.kind === "binding" ? iterationTarget.place : environment.createValue();
  }

  const bodyBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(exitBlock);

  for (const p of [iterationValuePlace, ...destructureTargetResults(iterationTarget)]) {
    if (!bodyBlock.entryBindings.includes(p)) bodyBlock.entryBindings.push(p);
  }

  parentBlock.setTerminal(new ForInTermOp(
    createOperationId(environment),
    objectPlace,
    iterationValuePlace,
    bodyBlock,
    exitBlock,
    label,
  ));

  functionBuilder.currentBlock = bodyBlock;
  const destructureKind =
    left.type === "VariableDeclaration" ? "declaration" : "assignment";
  if (bareLVal !== undefined || iterationTarget.kind !== "binding") {
    emitLoopIterationAssignment(
      iterationTarget,
      iterationValuePlace,
      functionBuilder,
      environment,
      destructureKind,
    );
  }
  functionBuilder.controlStack.push({
    kind: "loop",
    label,
    breakTarget: exitBlock.id,
    continueTarget: parentBlock.id,
    structured: false,
  });
  buildOwnedBody(node.body, forScope, functionBuilder, moduleBuilder, environment);
  functionBuilder.controlStack.pop();
  if (functionBuilder.currentBlock.terminal === undefined) {
    functionBuilder.currentBlock.setTerminal(new JumpTermOp(createOperationId(environment), parentBlock, []));
  }

  functionBuilder.currentBlock = exitBlock;
  return undefined;
}

function emitLoopIterationAssignment(
  target: DestructureTarget,
  valuePlace: Value,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
  destructureKind: "declaration" | "assignment" = "assignment",
): void {
  if (target.kind === "binding") {
    const StoreInstruction = target.storage === "context" ? StoreContextOp : StoreLocalOp;
    functionBuilder.addOp(
      environment.createOperation(
        StoreInstruction,
        environment.createValue(),
        target.place,
        valuePlace,
        "const",
        destructureKind === "declaration" ? "declaration" : "assignment",
      ),
    );
    return;
  }

  if (target.kind === "array") {
    functionBuilder.addOp(
      environment.createOperation(
        ArrayDestructureOp,
        environment.createValue(),
        target.elements,
        valuePlace,
        destructureKind,
        destructureKind === "declaration" ? "const" : null,
      ),
    );
    return;
  }

  if (target.kind === "object") {
    functionBuilder.addOp(
      environment.createOperation(
        ObjectDestructureOp,
        environment.createValue(),
        target.properties,
        valuePlace,
        destructureKind,
        destructureKind === "declaration" ? "const" : null,
      ),
    );
    return;
  }

  throw new Error(`Unsupported for-in assignment target: ${target.kind}`);
}
