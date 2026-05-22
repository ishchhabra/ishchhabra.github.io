import type { BasicBlock } from "../../../ir/core/Block";
import type { Operation } from "../../../ir/core/Operation";
import type { DeclarationId, Value } from "../../../ir/core/Value";
import { InitializeBindingOp } from "../../../ir/ops/bindings/InitializeBindingOp";
import { StoreBindingOp } from "../../../ir/ops/bindings/StoreBindingOp";
import { ConstantOp } from "../../../ir/ops/constants/ConstantOp";
import { ForTerminatorOp } from "../../../ir/ops/control/ForTerminatorOp";
import { DestructureBindingOp } from "../../../ir/ops/patterns/DestructureBindingOp";
import { CopyValueOp } from "../../../ir/ops/values/CopyValueOp";
import {
  assignmentExpression,
  blockStatement,
  forStatement,
  identifier,
  sequenceExpression,
  type ESTreeExpression,
  type ESTreePattern,
  type ESTreeStatement,
  type VariableDeclarationKind,
  type VariableDeclarationNode,
} from "../ast";
import type { CodegenContext } from "../CodegenContext";
import { emitOperation } from "../ops/emitOperation";
import {
  bindingPatternDeclarationIds,
  bindingPatternDeclarationKind,
  emitBindingPatternTarget,
} from "../ops/patterns/emitDestructurePattern";
import {
  emitBranchArm,
  emitEffectBlockExpression,
  emitLoopTestExpression,
  expressionFromStatement,
  expressionWithStatements,
  isValueRegionTerminator,
  loopTestTerminator,
  validateLoopTestEdges,
  withFallthrough,
  withOptionalLabel,
  type EmitControlContext,
} from "./emitFunction";

type ForHeaderMode = "lexical" | "var";

interface ReconstructedForDeclarator {
  readonly kind: VariableDeclarationKind;
  readonly id: ESTreePattern;
  init: ESTreeExpression | null;
  readonly bindingValue: Value | null;
  readonly copies: CopyValueOp[];
}

export function emitFor(
  context: CodegenContext,
  loop: ForTerminatorOp,
  initBlock: BasicBlock | null,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const loopBlock = loop.ownerBlock;
  if (loopBlock === null) {
    throw new Error(`ForTerminatorOp#${loop.id} is detached`);
  }

  const testTerminator = loopTestTerminator(loop.testBlock, `ForTerminatorOp#${loop.id}`);
  validateLoopTestEdges(
    testTerminator,
    loop.bodyBlock,
    loop.exitBlock,
    `ForTerminatorOp#${loop.id}`,
  );

  const testExpression = emitLoopTestExpression(
    context,
    loop.testBlock,
    testTerminator,
    loop.bodyBlock,
    loop.exitBlock,
    emitted,
  );

  const loopControl = {
    label: loop.label,
    breakTarget: loop.exitBlock,
    continueTarget: loop.updateBlock,
  };
  const loopControls = [...controls, loopControl];
  const init = emitForInit(context, loop, initBlock, emitted);
  const update = emitForUpdate(context, loop.updateBlock, loopBlock, emitted, loopControls);
  const body = emitBranchArm(context, loop.bodyBlock, loop.updateBlock, emitted, loopControls);

  return withFallthrough(context, loop.exitBlock, emitted, controls, continuation, () => [
    withOptionalLabel(loop.label, forStatement(init, testExpression, update, blockStatement(body))),
  ]);
}

function emitForInit(
  context: CodegenContext,
  loop: ForTerminatorOp,
  initBlock: BasicBlock | null,
  emitted: Set<BasicBlock>,
): VariableDeclarationNode | ESTreeExpression | null {
  if (initBlock === null || emitted.has(initBlock)) return null;

  const mode = forHeaderMode(context, initBlock);
  if (mode === null) return emitForExpressionInitBlock(context, initBlock, emitted);

  return emitForDeclarationInitBlock(context, initBlock, emitted, mode, loop);
}

function emitForExpressionInitBlock(
  context: CodegenContext,
  block: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression | null {
  if (emitted.has(block)) return null;
  emitted.add(block);

  const statements: ESTreeStatement[] = [];
  let expressionValue: Value | null = null;
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;
    if (op instanceof CopyValueOp && isUndefinedCopy(op)) {
      continue;
    }

    statements.push(...emitOperation(context, op));
    if (op.results.length !== 0) {
      expressionValue = op.results[op.results.length - 1];
    }
  }

  if (statements.length !== 0) {
    return sequenceExpression(statements.map(expressionFromStatement));
  }

  return expressionValue === null ? null : context.expressionForValue(expressionValue);
}

function emitForDeclarationInitBlock(
  context: CodegenContext,
  block: BasicBlock,
  emitted: Set<BasicBlock>,
  mode: ForHeaderMode,
  loop: ForTerminatorOp,
): VariableDeclarationNode {
  if (emitted.has(block)) {
    throw new Error(`ForTerminatorOp#${loop.id} initializer block was already emitted`);
  }
  emitted.add(block);

  const declarators: ReconstructedForDeclarator[] = [];
  const copySources = new Map<Value, ReconstructedForDeclarator>();
  const pendingStatements: ESTreeStatement[] = [];
  let pendingOperationCount = 0;
  let declarationKind: VariableDeclarationKind | null = null;
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;

    const copiedDeclarator =
      op instanceof CopyValueOp ? (copySources.get(op.source) ?? null) : null;
    if (op instanceof CopyValueOp && copiedDeclarator !== null) {
      copiedDeclarator.copies.push(op);
      copySources.set(op.target, copiedDeclarator);
      continue;
    }

    if (op instanceof CopyValueOp && isUndefinedCopy(op)) {
      continue;
    }

    const declarator = forHeaderDeclaratorFromOp(context, op, mode);
    if (declarator !== null) {
      if (declarationKind !== null && declarationKind !== declarator.kind) {
        throw new Error(`ForTerminatorOp#${loop.id} has mixed initializer declaration kinds`);
      }

      if (pendingStatements.length !== 0) {
        if (declarator.init === null) {
          throw new Error(`ForTerminatorOp#${loop.id} cannot fold initializer statements`);
        }

        declarator.init = expressionWithStatements(pendingStatements, declarator.init);
      }

      pendingStatements.length = 0;
      pendingOperationCount = 0;
      declarationKind = declarator.kind;
      declarators.push(declarator);

      if (declarator.bindingValue !== null) {
        copySources.set(declarator.bindingValue, declarator);
      }
      continue;
    }

    pendingStatements.push(...emitOperation(context, op));
    pendingOperationCount++;
  }

  if (pendingOperationCount !== 0) {
    appendForHeaderSideEffectDeclarator(context, declarators, pendingStatements, declarationKind);
  }

  if (declarators.length === 0 || declarationKind === null) {
    throw new Error(`ForTerminatorOp#${loop.id} has no reconstructable header declaration`);
  }

  for (const declarator of declarators) {
    foldForHeaderCopies(context, declarator, loop);
  }

  return {
    type: "VariableDeclaration",
    kind: declarationKind,
    declarations: declarators.map((declarator) => ({
      type: "VariableDeclarator",
      id: declarator.id,
      init: declarator.init,
    })),
  };
}

function forHeaderMode(context: CodegenContext, block: BasicBlock): ForHeaderMode | null {
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;
    if (
      op instanceof InitializeBindingOp &&
      declarationVariableKind(context, op.declarationId) !== "var"
    ) {
      return "lexical";
    }

    if (op instanceof DestructureBindingOp && op.mode === "initialize") {
      return "lexical";
    }
  }

  for (const op of block.operations) {
    if (op === terminator) continue;
    if (
      op instanceof StoreBindingOp &&
      declarationVariableKind(context, op.declarationId) === "var"
    ) {
      return "var";
    }

    if (op instanceof DestructureBindingOp && op.mode === "store") {
      return "var";
    }
  }

  return null;
}

function forHeaderDeclaratorFromOp(
  context: CodegenContext,
  op: Operation,
  mode: ForHeaderMode,
): ReconstructedForDeclarator | null {
  if (mode === "lexical") {
    if (op instanceof InitializeBindingOp) {
      const kind = declarationVariableKind(context, op.declarationId);
      if (kind === "var") return null;

      const id = identifier(context.names.declarationName(op.declarationId));
      context.declaredDeclarations.add(op.declarationId);
      context.values.set(op.bindingValue, id);

      return {
        kind,
        id,
        init: context.expressionForValue(op.value),
        bindingValue: op.bindingValue,
        copies: [],
      };
    }

    if (op instanceof DestructureBindingOp && op.mode === "initialize") {
      return destructuringForHeaderDeclarator(context, op);
    }

    return null;
  }

  if (
    op instanceof StoreBindingOp &&
    declarationVariableKind(context, op.declarationId) === "var"
  ) {
    const id = identifier(context.names.declarationName(op.declarationId));
    context.declaredDeclarations.add(op.declarationId);
    context.values.set(op.bindingValue, id);

    return {
      kind: "var",
      id,
      init: context.expressionForValue(op.value),
      bindingValue: op.bindingValue,
      copies: [],
    };
  }

  if (
    op instanceof DestructureBindingOp &&
    op.mode === "store" &&
    bindingPatternDeclarationKindOrMode(context, op) === "var"
  ) {
    return destructuringForHeaderDeclarator(context, op);
  }

  return null;
}

function destructuringForHeaderDeclarator(
  context: CodegenContext,
  op: DestructureBindingOp,
): ReconstructedForDeclarator {
  const id = emitBindingPatternTarget(context, op.target);

  for (const declarationId of bindingPatternDeclarationIds(op.target)) {
    context.declaredDeclarations.add(declarationId);
  }

  return {
    kind: bindingPatternDeclarationKindOrMode(context, op),
    id,
    init: context.expressionForValue(op.source),
    bindingValue: null,
    copies: [],
  };
}

function appendForHeaderSideEffectDeclarator(
  context: CodegenContext,
  declarators: ReconstructedForDeclarator[],
  statements: readonly ESTreeStatement[],
  declarationKind: VariableDeclarationKind | null,
): void {
  if (statements.length === 0) return;
  if (declarationKind === null) {
    throw new Error("Cannot fold for-header side effects without a declaration kind");
  }

  declarators.push({
    kind: declarationKind,
    id: identifier(context.names.temporaryName("$forInit")),
    init: sequenceExpression(statements.map(expressionFromStatement)),
    bindingValue: null,
    copies: [],
  });
}

function bindingPatternDeclarationKindOrMode(
  context: CodegenContext,
  op: DestructureBindingOp,
): VariableDeclarationKind {
  if (bindingPatternDeclarationIds(op.target).length === 0) {
    return op.mode === "store" ? "var" : "let";
  }

  return bindingPatternDeclarationKind(context, op.target);
}

function declarationVariableKind(
  context: CodegenContext,
  declarationId: DeclarationId,
): VariableDeclarationKind {
  const declaration = context.declaration(declarationId);
  if (declaration.kind === "var") return "var";

  if (declaration.kind === "lexical") {
    return declaration.mode === "const" ? "const" : "let";
  }

  if (declaration.kind === "catch-parameter" || declaration.kind === "parameter") {
    return "let";
  }

  throw new Error(`Cannot emit declaration for ${declaration.kind} binding`);
}

function isUndefinedCopy(op: CopyValueOp): boolean {
  const definer = op.source.definer;
  return definer instanceof ConstantOp && definer.value === undefined;
}

function foldForHeaderCopies(
  context: CodegenContext,
  declarator: ReconstructedForDeclarator,
  loop: ForTerminatorOp,
): void {
  if (declarator.copies.length === 0) return;
  if (declarator.init === null) {
    throw new Error(`ForTerminatorOp#${loop.id} has unsupported initializer copy`);
  }

  const expressions: ESTreeExpression[] = [];
  let current = declarator.init;

  for (const copy of declarator.copies) {
    const target = identifier(context.names.valueName(copy.target));
    expressions.push(assignmentExpression(target, current));
    current = target;
  }

  declarator.init = sequenceExpression([...expressions, current]);
}

function emitForUpdate(
  context: CodegenContext,
  block: BasicBlock,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
) {
  if (isValueRegionTerminator(block.terminator)) {
    return emitEffectBlockExpression(context, block, continuation, emitted).expression;
  }

  const statements = emitBranchArm(context, block, continuation, emitted, controls);
  if (statements.length === 0) return null;

  const expressions = statements.map(expressionFromStatement);
  if (expressions.length === 1) return expressions[0];

  return sequenceExpression(expressions);
}
