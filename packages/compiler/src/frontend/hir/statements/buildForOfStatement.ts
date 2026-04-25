import type * as AST from "../../estree";
import type { ForOfStatement, MemberExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import {
  ArrayDestructureOp,
  BindingDeclOp,
  BindingInitOp,
  createOperationId,
  destructureTargetResults,
  type DestructureTarget,
  ForOfTermOp,
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

/**
 * Lower `for (target of iterable) body` to flat CFG with ForOfTermOp.
 */
export function buildForOfStatement(
  node: ForOfStatement,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
  label?: string,
) {
  const iterablePlace = buildNode(node.right, scope, functionBuilder, moduleBuilder, environment);
  if (iterablePlace === undefined || Array.isArray(iterablePlace)) {
    throw new Error("For-of iterable must be a single place");
  }
  // parentBlock captured AFTER iterable — compound iterables may
  // have moved currentBlock.
  const parentBlock = functionBuilder.currentBlock;

  const forScope = functionBuilder.scopeFor(node);
  instantiateScopeBindings(node, forScope, functionBuilder, environment, moduleBuilder);

  const left = node.left;
  let iterationValuePlace: Value;
  let iterationBindingKind: "let" | "const" | "var" | null;
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
    // For a simple binding target (`for (const x of iter)`), reuse
    // the binding place as the iteration value — codegen emits
    // `for (const x of iter)` directly, no intermediate store needed.
    // For destructuring targets, allocate a fresh temporary.
    iterationValuePlace =
      iterationTarget.kind === "binding" ? iterationTarget.place : environment.createValue();
    iterationBindingKind = iterationTarget.kind === "binding" ? kind : "const";
  } else {
    bareLVal = left as AST.Pattern | MemberExpression;
    iterationTarget = buildLVal(bareLVal, scope, functionBuilder, moduleBuilder, environment, {
      kind: "assignment",
    });
    iterationValuePlace =
      iterationTarget.kind === "binding" ? iterationTarget.place : environment.createValue();
    iterationBindingKind = iterationTarget.kind === "binding" ? null : "const";
  }

  const bodyBlock = environment.createBlock();
  const exitBlock = environment.createBlock();
  functionBuilder.addBlock(bodyBlock);
  functionBuilder.addBlock(exitBlock);

  for (const p of [iterationValuePlace, ...destructureTargetResults(iterationTarget)]) {
    if (!bodyBlock.entryBindings.includes(p)) bodyBlock.entryBindings.push(p);
  }

  parentBlock.setTerminal(
    new ForOfTermOp(
      createOperationId(environment),
      iterablePlace,
      iterationValuePlace,
      iterationBindingKind,
      bodyBlock,
      exitBlock,
      node.await,
      label,
    ),
  );

  functionBuilder.currentBlock = bodyBlock;
  // Emit the per-iteration assignment for any non-binding target —
  // either a bare LHS (assignment form) or a destructuring pattern
  // (VariableDeclaration with array/object target). Binding targets
  // are already wired by reusing iterationValuePlace = target.place.
  // `declaration` when for-of has `const/let/var [x, y] of ...` —
  // emits `const [x, y] = iter` in the body. `assignment` for bare
  // LHS like `for ([x, y] of ...)`.
  const destructureKind = left.type === "VariableDeclaration" ? "declaration" : "assignment";
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
    functionBuilder.currentBlock.setTerminal(
      new JumpTermOp(createOperationId(environment), parentBlock, []),
    );
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
    if (target.storage === "context") {
      functionBuilder.addOp(
        environment.createOperation(
          StoreContextOp,
          environment.createValue(),
          target.place,
          valuePlace,
          "let",
          destructureKind === "declaration" ? "declaration" : "assignment",
        ),
      );
    } else {
      if (destructureKind === "declaration") {
        if (target.place !== valuePlace) {
          functionBuilder.addOp(
            environment.createOperation(BindingInitOp, target.place, "const", valuePlace),
          );
        }
      } else {
        functionBuilder.addOp(
          environment.createOperation(
            StoreLocalOp,
            environment.createValue(),
            target.place,
            valuePlace,
          ),
        );
      }
    }
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

  throw new Error(`Unsupported for-of assignment target: ${target.kind}`);
}
