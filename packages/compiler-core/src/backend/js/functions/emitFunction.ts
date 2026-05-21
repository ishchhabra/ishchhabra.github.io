import type { BasicBlock } from "../../../ir/core/Block";
import type { FunctionIR } from "../../../ir/core/FunctionIR";
import { successorValues, type BlockTarget } from "../../../ir/core/TerminatorOp";
import type { Value } from "../../../ir/core/Value";
import { InitializeBindingOp } from "../../../ir/ops/bindings/InitializeBindingOp";
import { BranchTerminatorOp } from "../../../ir/ops/control/BranchTerminatorOp";
import { ConditionalTerminatorOp } from "../../../ir/ops/control/ConditionalTerminatorOp";
import { ForInTerminatorOp } from "../../../ir/ops/control/ForInTerminatorOp";
import { ForOfTerminatorOp } from "../../../ir/ops/control/ForOfTerminatorOp";
import { ForTerminatorOp } from "../../../ir/ops/control/ForTerminatorOp";
import { IfTerminatorOp } from "../../../ir/ops/control/IfTerminatorOp";
import { JumpTerminatorOp } from "../../../ir/ops/control/JumpTerminatorOp";
import { LabeledTerminatorOp } from "../../../ir/ops/control/LabeledTerminatorOp";
import { NullishGuardTerminatorOp } from "../../../ir/ops/control/NullishGuardTerminatorOp";
import { ShortCircuitTerminatorOp } from "../../../ir/ops/control/ShortCircuitTerminatorOp";
import { SwitchTerminatorOp } from "../../../ir/ops/control/SwitchTerminatorOp";
import { TryTerminatorOp } from "../../../ir/ops/control/TryTerminatorOp";
import { WhileTerminatorOp } from "../../../ir/ops/control/WhileTerminatorOp";
import { CopyValueOp } from "../../../ir/ops/values/CopyValueOp";
import {
  assignmentExpression,
  binaryExpression,
  blockStatement,
  breakStatement,
  catchClause,
  conditionalExpression,
  continueStatement,
  doWhileStatement,
  expressionStatement,
  forInStatement,
  forOfStatement,
  identifier,
  functionExpression,
  ifStatement,
  labeledStatement,
  literal,
  logicalExpression,
  switchCase as switchCaseNode,
  switchStatement,
  tryStatement,
  variableDeclaration,
  whileStatement,
  restElement,
  type ESTreePattern,
  type ESTreeExpression,
  type ESTreeStatement,
  type IdentifierNode,
  sequenceExpression,
  unaryExpression,
  type VariableDeclarationKind,
  type VariableDeclarationNode,
} from "../ast";
import type { CodegenContext } from "../CodegenContext";
import { emitOperation } from "../ops/emitOperation";
import {
  bindingPatternDeclarationIds,
  emitBindingPatternTarget,
} from "../ops/patterns/emitDestructurePattern";
import { emitFor } from "./emitFor";

export type ValueRegionTerminator =
  | IfTerminatorOp
  | ConditionalTerminatorOp
  | NullishGuardTerminatorOp
  | ShortCircuitTerminatorOp;
export type LoopTestTerminator = BranchTerminatorOp | JumpTerminatorOp | ValueRegionTerminator;

export interface EmitControlContext {
  readonly label: string | null;
  readonly breakTarget: BasicBlock;
  readonly continueTarget: BasicBlock | null;
  readonly requireLabel?: boolean;
}

interface EmitBranchArmOptions {
  readonly implicitJumpTarget?: BasicBlock | null;
}

interface EffectExpression {
  readonly expression: ESTreeExpression;
  readonly hasEffects: boolean;
}

/**
 * Emits a structured JavaScript function body from lowered CFG blocks.
 *
 * This emitter supports straight-line blocks and structured if/else diamonds.
 * Arbitrary CFG shapes should be handled by structured-control recovery or a
 * lower-level backend.
 */
export function emitFunctionBody(context: CodegenContext, fn: FunctionIR): ESTreeStatement[] {
  const emitted = new Set<BasicBlock>();
  const statements: ESTreeStatement[] = [];

  statements.push(...declareCopyTargets(context, fn));
  statements.push(...declareBlockParams(context, fn));
  statements.push(...emitBlock(context, fn.entryBlock, emitted, []));

  return statements;
}

/**
 * Emits source-level function parameters.
 */
export function emitFunctionParams(context: CodegenContext, fn: FunctionIR): ESTreePattern[] {
  return fn.params
    .filter((param) => param.kind === "argument" || param.kind === "rest")
    .map((param) => {
      for (const id of bindingPatternDeclarationIds(param.target)) {
        context.declaredDeclarations.add(id);
      }

      const pattern = emitBindingPatternTarget(context, param.target);
      if (patternCanBeExpression(pattern)) {
        context.values.set(param.value, pattern);
      }

      return param.kind === "rest" ? restElement(pattern) : pattern;
    });
}

function patternCanBeExpression(
  pattern: ESTreePattern,
): pattern is ESTreePattern & ESTreeExpression {
  return pattern.type === "Identifier" || pattern.type === "MemberExpression";
}

/**
 * Emits a nested function as a JavaScript function expression.
 */
export function emitFunctionExpression(context: CodegenContext, fn: FunctionIR): ESTreeExpression {
  const body = emitFunctionBody(context, fn);
  const params = emitFunctionParams(context, fn);

  return functionExpression(params, body, {
    id: emitFunctionName(context, fn),
    async: fn.isAsync,
    generator: fn.isGenerator,
  });
}

export function emitFunctionName(context: CodegenContext, fn: FunctionIR): IdentifierNode | null {
  if (fn.selfBindingDeclarationId !== null) {
    return identifier(context.names.declarationName(fn.selfBindingDeclarationId));
  }

  return null;
}

function declareCopyTargets(context: CodegenContext, fn: FunctionIR): ESTreeStatement[] {
  const blockParams = new Set<Value>();
  const copyTargets = new Set<Value>();

  for (const block of fn.blocks) {
    for (const param of block.params) {
      blockParams.add(param);
    }

    for (const op of block.operations) {
      if (op instanceof CopyValueOp) {
        copyTargets.add(op.target);
      }
    }
  }

  return [...copyTargets]
    .filter((target) => !blockParams.has(target))
    .map((target) => variableDeclaration("let", identifier(context.names.valueName(target)), null));
}

function declareBlockParams(context: CodegenContext, fn: FunctionIR): ESTreeStatement[] {
  const declarations: ESTreeStatement[] = [];
  const headerParams = structuredHeaderParams(fn);

  for (const block of fn.blocks) {
    for (const param of block.params) {
      if (headerParams.has(param)) continue;

      declarations.push(
        variableDeclaration("let", identifier(context.names.valueName(param)), null),
      );
    }
  }

  return declarations;
}

function structuredHeaderParams(fn: FunctionIR): Set<Value> {
  const params = new Set<Value>();

  for (const block of fn.blocks) {
    const terminator = block.terminator;
    if (!(terminator instanceof ForInTerminatorOp) && !(terminator instanceof ForOfTerminatorOp)) {
      continue;
    }

    for (const value of terminator.bodyTarget.operands.produced) {
      params.add(value);
    }
  }

  for (const block of fn.blocks) {
    const terminator = block.terminator;
    if (!(terminator instanceof TryTerminatorOp)) continue;
    if (terminator.catchTarget === null) continue;

    for (const value of terminator.catchTarget.operands.produced) {
      params.add(value);
    }
  }

  for (const block of fn.blocks) {
    const terminator = block.terminator;
    if (!(terminator instanceof WhileTerminatorOp)) continue;

    const testTerminator = terminator.testBlock.terminator;
    if (!isValueRegionTerminator(testTerminator)) continue;

    collectValueRegionParams(testTerminator, params, new Set());
  }

  return params;
}

function collectValueRegionParams(
  terminator: ValueRegionTerminator,
  params: Set<Value>,
  visited: Set<ValueRegionTerminator>,
): void {
  if (visited.has(terminator)) return;
  visited.add(terminator);

  for (const param of terminator.completionBlock.params) {
    params.add(param);
  }

  if (terminator instanceof ConditionalTerminatorOp) {
    const consequentTerminator = terminator.consequentBlock.terminator;
    if (isValueRegionTerminator(consequentTerminator)) {
      collectValueRegionParams(consequentTerminator, params, visited);
    }

    const alternateTerminator = terminator.alternateBlock.terminator;
    if (isValueRegionTerminator(alternateTerminator)) {
      collectValueRegionParams(alternateTerminator, params, visited);
    }
  } else if (terminator instanceof IfTerminatorOp) {
    const thenTerminator = terminator.thenBlock.terminator;
    if (isValueRegionTerminator(thenTerminator)) {
      collectValueRegionParams(thenTerminator, params, visited);
    }

    const elseTerminator = terminator.elseBlock.terminator;
    if (isValueRegionTerminator(elseTerminator)) {
      collectValueRegionParams(elseTerminator, params, visited);
    }
  } else {
    const bodyTerminator = terminator.bodyBlock.terminator;
    if (isValueRegionTerminator(bodyTerminator)) {
      collectValueRegionParams(bodyTerminator, params, visited);
    }
  }

  const exitTerminator = terminator.completionBlock.terminator;
  if (isValueRegionTerminator(exitTerminator)) {
    collectValueRegionParams(exitTerminator, params, visited);
  }
}

export function isValueRegionTerminator(terminator: unknown): terminator is ValueRegionTerminator {
  return (
    terminator instanceof IfTerminatorOp ||
    terminator instanceof ConditionalTerminatorOp ||
    terminator instanceof NullishGuardTerminatorOp ||
    terminator instanceof ShortCircuitTerminatorOp
  );
}

function emitBlock(
  context: CodegenContext,
  block: BasicBlock,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
): ESTreeStatement[] {
  if (emitted.has(block)) return [];

  const forInOfLoop = forInOfLoopFromHeadBlock(block);
  if (forInOfLoop !== null) {
    return forInOfLoop.kind === "for-in"
      ? emitForIn(context, forInOfLoop.loop, emitted, controls, null, block)
      : emitForOf(context, forInOfLoop.loop, emitted, controls, null, block);
  }

  const initLoop = forLoopFromInitBlock(block);
  if (initLoop !== null) {
    return emitFor(context, initLoop, block, emitted, controls);
  }

  emitted.add(block);

  const statements: ESTreeStatement[] = [];
  const terminator = block.terminator;

  if (terminator instanceof ForInTerminatorOp) {
    statements.push(...emitForIn(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof ForOfTerminatorOp) {
    statements.push(...emitForOf(context, terminator, emitted, controls));
    return statements;
  }

  for (const op of block.operations) {
    if (op === terminator) continue;
    statements.push(...emitOperation(context, op));
  }

  if (terminator === null) return statements;

  if (terminator instanceof JumpTerminatorOp) {
    statements.push(...emitJump(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof IfTerminatorOp) {
    statements.push(...emitIf(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof ConditionalTerminatorOp) {
    statements.push(...emitConditional(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof ShortCircuitTerminatorOp) {
    statements.push(...emitShortCircuit(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof NullishGuardTerminatorOp) {
    statements.push(...emitNullishGuard(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof BranchTerminatorOp) {
    statements.push(...emitBranch(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof SwitchTerminatorOp) {
    statements.push(...emitSwitch(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof LabeledTerminatorOp) {
    statements.push(...emitLabeled(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof TryTerminatorOp) {
    statements.push(...emitTry(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof WhileTerminatorOp) {
    statements.push(...emitWhile(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof ForTerminatorOp) {
    statements.push(...emitFor(context, terminator, null, emitted, controls));
    return statements;
  }

  statements.push(...emitOperation(context, terminator));
  return statements;
}

function emitForIn(
  context: CodegenContext,
  loop: ForInTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
  headBlock: BasicBlock | null = null,
): ESTreeStatement[] {
  const loopBlock = loop.ownerBlock;
  if (loopBlock === null) {
    throw new Error(`ForInTerminatorOp#${loop.id} is detached`);
  }

  const propertyKeys = loop.bodyTarget.operands.produced;
  if (propertyKeys.length !== 1) {
    throw new Error(`ForInTerminatorOp#${loop.id} expected one produced property key`);
  }

  const propertyKey = propertyKeys[0];
  const loopControl = {
    label: loop.label,
    breakTarget: loop.continuationBlock,
    continueTarget: loopBlock,
  };
  const headerDeclaration = forInOfLexicalHeader(context, loop.bodyBlock, propertyKey);
  const object = forInOfHeadExpression(
    context,
    headBlock ?? loopBlock,
    loopBlock,
    loop.object,
    emitted,
  );
  const body = emitTargetBranchArm(context, loop.bodyTarget, loopBlock, emitted, [
    ...controls,
    loopControl,
  ]);

  return withFallthrough(context, loop.continuationBlock, emitted, controls, continuation, () => [
    withOptionalLabel(
      loop.label,
      forInStatement(
        headerDeclaration ??
          variableDeclaration("let", identifier(context.names.valueName(propertyKey)), null),
        object,
        blockStatement(body),
      ),
    ),
  ]);
}

function emitSwitch(
  context: CodegenContext,
  op: SwitchTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const switchControl = {
    label: op.label,
    breakTarget: op.completionBlock,
    continueTarget: null,
  };
  const switchControls = [...controls, switchControl];
  const emittedCases = op.cases.filter((switchCase) => !switchCase.synthetic);

  return withFallthrough(context, op.completionBlock, emitted, controls, continuation, () => [
    withOptionalLabel(
      op.label,
      switchStatement(
        context.expressionForValue(op.discriminant),
        emittedCases.map((switchCase, index) => {
          const continuation =
            index + 1 < emittedCases.length
              ? targetEntryBlock(emittedCases[index + 1].target)
              : op.completionBlock;

          return switchCaseNode(
            switchCase.test === null ? null : context.expressionForValue(switchCase.test),
            emitTargetBranchArm(
              context,
              switchCase.target,
              continuation,
              emitted,
              switchControls,
              {
                implicitJumpTarget: continuation,
              },
            ),
          );
        }),
      ),
    ),
  ]);
}

function emitLabeled(
  context: CodegenContext,
  op: LabeledTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const labelControl = {
    label: op.label,
    breakTarget: op.exitBlock,
    continueTarget: null,
    requireLabel: true,
  };

  return withFallthrough(context, op.exitBlock, emitted, controls, continuation, () => {
    const body = emitTargetBranchArm(context, op.bodyTarget, op.exitBlock, emitted, [
      ...controls,
      labelControl,
    ]);

    return [labeledStatement(identifier(op.label), blockStatement(body))];
  });
}

function emitTry(
  context: CodegenContext,
  op: TryTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const tryEntry = emitBlockTargetEntry(context, op.tryTarget, emitted);
  const catchEntry =
    op.catchTarget === null ? null : emitBlockTargetEntry(context, op.catchTarget, emitted);
  const finallyEntry =
    op.finallyTarget === null ? null : emitBlockTargetEntry(context, op.finallyTarget, emitted);
  const innerContinuation = finallyEntry?.entryBlock ?? op.completionBlock;
  const body = [
    ...tryEntry.prologue,
    ...emitBranchArm(context, tryEntry.entryBlock, innerContinuation, emitted, controls),
  ];

  const handler =
    catchEntry === null
      ? null
      : catchClause(catchParam(context, op), [
          ...catchEntry.prologue,
          ...emitBranchArm(context, catchEntry.entryBlock, innerContinuation, emitted, controls),
        ]);

  const finalizer =
    finallyEntry === null
      ? null
      : [
          ...finallyEntry.prologue,
          ...emitBranchArm(context, finallyEntry.entryBlock, op.completionBlock, emitted, controls),
        ];

  return [
    tryStatement(body, handler, finalizer),
    ...(continuation === null
      ? emitBlock(context, op.completionBlock, emitted, controls)
      : emitBranchArm(context, op.completionBlock, continuation, emitted, controls)),
  ];
}

function catchParam(context: CodegenContext, op: TryTerminatorOp): ESTreePattern | null {
  if (op.catchTarget === null) return null;

  const params = op.catchTarget.operands.produced;
  if (params.length === 0) return null;
  if (params.length !== 1) {
    throw new Error(`TryTerminatorOp#${op.id} expected one catch parameter`);
  }

  const param = params[0];
  context.values.set(param, identifier(context.names.valueName(param)));
  return identifier(context.names.valueName(param));
}

function emitForOf(
  context: CodegenContext,
  loop: ForOfTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
  headBlock: BasicBlock | null = null,
): ESTreeStatement[] {
  const loopBlock = loop.ownerBlock;
  if (loopBlock === null) {
    throw new Error(`ForOfTerminatorOp#${loop.id} is detached`);
  }

  const iterationValues = loop.bodyTarget.operands.produced;
  if (iterationValues.length !== 1) {
    throw new Error(`ForOfTerminatorOp#${loop.id} expected one produced iteration value`);
  }

  const iterationValue = iterationValues[0];
  const loopControl = {
    label: loop.label,
    breakTarget: loop.continuationBlock,
    continueTarget: loopBlock,
  };
  const headerDeclaration = forInOfLexicalHeader(context, loop.bodyBlock, iterationValue);
  const iterable = forInOfHeadExpression(
    context,
    headBlock ?? loopBlock,
    loopBlock,
    loop.iterable,
    emitted,
  );
  const body = emitTargetBranchArm(context, loop.bodyTarget, loopBlock, emitted, [
    ...controls,
    loopControl,
  ]);

  return withFallthrough(context, loop.continuationBlock, emitted, controls, continuation, () => [
    withOptionalLabel(
      loop.label,
      forOfStatement(
        headerDeclaration ??
          variableDeclaration("let", identifier(context.names.valueName(iterationValue)), null),
        iterable,
        blockStatement(body),
        loop.isAwait,
      ),
    ),
  ]);
}

function forInOfLexicalHeader(
  context: CodegenContext,
  bodyBlock: BasicBlock,
  loopValue: Value,
): VariableDeclarationNode | null {
  const firstOp = bodyBlock.operations.find((op) => op !== bodyBlock.terminator);
  if (!(firstOp instanceof InitializeBindingOp) || firstOp.value !== loopValue) return null;

  const declaration = context.declaration(firstOp.declarationId);
  if (declaration.kind !== "lexical") return null;
  if (declaration.mode === "class") return null;

  const kind: VariableDeclarationKind = declaration.mode;
  const id = identifier(context.names.declarationName(firstOp.declarationId));

  context.declaredDeclarations.add(firstOp.declarationId);
  context.values.set(firstOp.bindingValue, id);

  return variableDeclaration(kind, id, null);
}

function forInOfHeadExpression(
  context: CodegenContext,
  headBlock: BasicBlock,
  loopBlock: BasicBlock,
  value: Value,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  if (headBlock !== loopBlock) {
    return emitValueBlockExpression(context, headBlock, loopBlock, emitted);
  }

  const statements: ESTreeStatement[] = [];
  const terminator = loopBlock.terminator;

  for (const op of loopBlock.operations) {
    if (op === terminator) continue;
    statements.push(...emitOperation(context, op));
  }

  return expressionWithStatements(statements, context.expressionForValue(value));
}

function emitWhile(
  context: CodegenContext,
  loop: WhileTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const loopBlock = loop.ownerBlock;
  if (loopBlock === null) {
    throw new Error(`WhileTerminatorOp#${loop.id} is detached`);
  }

  const expectedTrueBlock = loop.kind === "do-while" ? loopBlock : loop.bodyBlock;
  const testTerminator = loopTestTerminator(loop.testBlock, `WhileTerminatorOp#${loop.id}`);
  validateLoopTestEdges(
    testTerminator,
    expectedTrueBlock,
    loop.exitBlock,
    `WhileTerminatorOp#${loop.id}`,
  );

  if (loop.kind === "do-while") {
    return emitDoWhile(context, loop, testTerminator, emitted, controls, continuation);
  }

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
    continueTarget: loopBlock,
  };
  const body = emitTargetBranchArm(context, loop.bodyTarget, loopBlock, emitted, [
    ...controls,
    loopControl,
  ]);

  return withFallthrough(context, loop.exitBlock, emitted, controls, continuation, () => [
    withOptionalLabel(loop.label, whileStatement(testExpression, blockStatement(body))),
  ]);
}

function emitDoWhile(
  context: CodegenContext,
  loop: WhileTerminatorOp,
  testTerminator: LoopTestTerminator,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  const loopBlock = loop.ownerBlock;
  if (loopBlock === null) {
    throw new Error(`WhileTerminatorOp#${loop.id} is detached`);
  }

  const loopControl = {
    label: loop.label,
    breakTarget: loop.exitBlock,
    continueTarget: loop.testBlock,
  };
  const body = emitTargetBranchArm(context, loop.bodyTarget, loop.testBlock, emitted, [
    ...controls,
    loopControl,
  ]);
  const testExpression = emitLoopTestExpression(
    context,
    loop.testBlock,
    testTerminator,
    loopBlock,
    loop.exitBlock,
    emitted,
  );

  return [
    withOptionalLabel(loop.label, doWhileStatement(blockStatement(body), testExpression)),
    ...emitContinuation(context, loop.exitBlock, continuation, emitted, controls),
  ];
}

export function loopTestTerminator(block: BasicBlock, owner: string): LoopTestTerminator {
  const terminator = block.terminator;
  if (terminator instanceof BranchTerminatorOp || isValueRegionTerminator(terminator)) {
    return terminator;
  }

  if (terminator instanceof JumpTerminatorOp) return terminator;

  throw new Error(
    `${owner} test block must end with BranchTerminatorOp, JumpTerminatorOp, or value-region terminator`,
  );
}

function loopTestTerminatorForValueRegion(
  terminator: ValueRegionTerminator,
  owner?: string,
): BranchTerminatorOp | JumpTerminatorOp {
  const exitTerminator = terminator.completionBlock.terminator;
  if (exitTerminator instanceof BranchTerminatorOp) return exitTerminator;
  if (exitTerminator instanceof JumpTerminatorOp) return exitTerminator;
  if (isValueRegionTerminator(exitTerminator)) {
    return loopTestTerminatorForValueRegion(exitTerminator, owner);
  }

  const label = owner ?? `${terminator.constructor.name}#${terminator.id}`;
  throw new Error(
    `${label} value-region exit block must end with BranchTerminatorOp or JumpTerminatorOp`,
  );
}

export function emitLoopTestExpression(
  context: CodegenContext,
  block: BasicBlock,
  terminator: LoopTestTerminator,
  trueContinuation: BasicBlock,
  falseContinuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  if (isValueRegionTerminator(terminator)) {
    return emitValueRegionLoopTestExpression(
      context,
      block,
      terminator,
      trueContinuation,
      falseContinuation,
      emitted,
    );
  }

  if (terminator instanceof JumpTerminatorOp) {
    return emitConstantLoopTestExpression(
      context,
      block,
      terminator,
      trueContinuation,
      falseContinuation,
      emitted,
    );
  }

  const branch = terminator;
  const statements = emitLoopTest(context, block, emitted);
  const trueStatements = emitLoopTestEdge(context, branch.trueTarget, trueContinuation, emitted);
  const falseStatements = emitLoopTestEdge(context, branch.falseTarget, falseContinuation, emitted);
  const condition = context.expressionForValue(branch.condition);
  const test =
    trueStatements.length === 0 && falseStatements.length === 0
      ? condition
      : conditionalExpression(
          condition,
          edgeResultExpression(trueStatements, true),
          edgeResultExpression(falseStatements, false),
        );

  if (statements.length === 0) return test;

  return sequenceExpression([...statements.map(expressionFromStatement), test]);
}

function emitValueRegionLoopTestExpression(
  context: CodegenContext,
  block: BasicBlock,
  terminator: ValueRegionTerminator,
  trueContinuation: BasicBlock,
  falseContinuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  const resolved = loopTestTerminatorForValueRegion(terminator);
  const branchBlock = resolved.ownerBlock;
  if (branchBlock === null) {
    throw new Error(`${resolved.constructor.name}#${resolved.id} is detached`);
  }

  emitValueBlockExpression(context, block, branchBlock, emitted);
  return emitLoopTestExpression(
    context,
    branchBlock,
    resolved,
    trueContinuation,
    falseContinuation,
    emitted,
  );
}

function emitConstantLoopTestExpression(
  context: CodegenContext,
  block: BasicBlock,
  terminator: JumpTerminatorOp,
  trueContinuation: BasicBlock,
  falseContinuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  const entry = emitBlockTargetEntry(
    context,
    terminator.jumpTarget,
    emitted,
    new Set([trueContinuation, falseContinuation]),
  );
  const statements = [...emitLoopTest(context, block, emitted), ...entry.prologue];

  if (entry.entryBlock === trueContinuation) {
    return edgeResultExpression(statements, true);
  }

  if (entry.entryBlock === falseContinuation) {
    return edgeResultExpression(statements, false);
  }

  const targetTerminator = loopTestTerminator(
    entry.entryBlock,
    `Loop test jump target bb${entry.entryBlock.id}`,
  );
  const expression = emitLoopTestExpression(
    context,
    entry.entryBlock,
    targetTerminator,
    trueContinuation,
    falseContinuation,
    emitted,
  );

  if (statements.length === 0) return expression;

  return sequenceExpression([...statements.map(expressionFromStatement), expression]);
}

function emitValueBlockExpression(
  context: CodegenContext,
  block: BasicBlock,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  const statements = emitValueBlockOperations(context, block, emitted);
  const terminator = block.terminator;

  if (terminator instanceof JumpTerminatorOp) {
    const entry = emitBlockTargetEntry(
      context,
      terminator.jumpTarget,
      emitted,
      new Set([continuation]),
    );
    if (entry.entryBlock !== continuation) {
      throw new Error(`Value block bb${block.id} must jump to bb${continuation.id}`);
    }

    const args = successorValues(entry.entryTarget);
    if (args.length !== 1) {
      throw new Error(`Value block bb${block.id} jump expected one result, got ${args.length}`);
    }

    return expressionWithStatements(statements, context.expressionForValue(args[0]));
  }

  if (terminator instanceof ConditionalTerminatorOp) {
    const consequent = emitValueTargetExpression(
      context,
      terminator.consequentTarget,
      terminator.completionBlock,
      emitted,
    );
    const alternate = emitValueTargetExpression(
      context,
      terminator.alternateTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(context.expressionForValue(terminator.test), consequent, alternate),
    );
    const result = valueRegionResultParam(terminator);
    context.values.set(result, expression);

    if (terminator.completionBlock === continuation) return expression;

    return emitValueBlockExpression(context, terminator.completionBlock, continuation, emitted);
  }

  if (terminator instanceof IfTerminatorOp) {
    const consequent = emitValueTargetExpression(
      context,
      terminator.thenTarget,
      terminator.completionBlock,
      emitted,
    );
    const alternate = emitValueTargetExpression(
      context,
      terminator.elseTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(
        context.expressionForValue(terminator.condition),
        consequent,
        alternate,
      ),
    );
    const result = valueRegionResultParam(terminator);
    context.values.set(result, expression);

    if (terminator.completionBlock === continuation) return expression;

    return emitValueBlockExpression(context, terminator.completionBlock, continuation, emitted);
  }

  if (terminator instanceof ShortCircuitTerminatorOp) {
    const bodyExpression = emitValueTargetExpression(
      context,
      terminator.bodyTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      logicalExpression(
        terminator.operator,
        context.expressionForValue(terminator.test),
        bodyExpression,
      ),
    );
    const result = valueRegionResultParam(terminator);
    context.values.set(result, expression);

    if (terminator.completionBlock === continuation) return expression;

    return emitValueBlockExpression(context, terminator.completionBlock, continuation, emitted);
  }

  if (terminator instanceof NullishGuardTerminatorOp) {
    const bodyExpression = emitValueTargetExpression(
      context,
      terminator.bodyTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(
        binaryExpression("==", context.expressionForValue(terminator.guard), literal(null)),
        valueRegionExitExpression(context, terminator),
        bodyExpression,
      ),
    );
    const result = valueRegionResultParam(terminator);
    context.values.set(result, expression);

    if (terminator.completionBlock === continuation) return expression;

    return emitValueBlockExpression(context, terminator.completionBlock, continuation, emitted);
  }

  throw new Error(
    `Value block bb${block.id} must end with JumpTerminatorOp or value-region terminator`,
  );
}

function emitValueTargetExpression(
  context: CodegenContext,
  target: BlockTarget,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeExpression {
  const entry = emitBlockTargetEntry(context, target, emitted, new Set([continuation]));
  if (entry.entryBlock === continuation) {
    const args = successorValues(entry.entryTarget);
    if (args.length !== 1) {
      throw new Error(
        `Value target bb${entry.entryBlock.id} expected one result, got ${args.length}`,
      );
    }

    return context.expressionForValue(args[0]);
  }

  return expressionWithStatements(
    entry.prologue,
    emitValueBlockExpression(context, entry.entryBlock, continuation, emitted),
  );
}

export function emitEffectBlockExpression(
  context: CodegenContext,
  block: BasicBlock,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
): EffectExpression {
  const statements = emitValueBlockOperations(context, block, emitted);
  const terminator = block.terminator;

  if (terminator instanceof JumpTerminatorOp) {
    const entry = emitBlockTargetEntry(
      context,
      terminator.jumpTarget,
      emitted,
      new Set([continuation]),
    );
    const prefix = effectExpressionFromStatements([...statements, ...entry.prologue]);

    if (entry.entryBlock === continuation) return prefix;

    return sequenceEffectExpression(
      prefix,
      emitEffectBlockExpression(context, entry.entryBlock, continuation, emitted),
    );
  }

  if (terminator instanceof ConditionalTerminatorOp) {
    const consequent = emitEffectTargetExpression(
      context,
      terminator.consequentTarget,
      terminator.completionBlock,
      emitted,
    );
    const alternate = emitEffectTargetExpression(
      context,
      terminator.alternateTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(
        context.expressionForValue(terminator.test),
        consequent.expression,
        alternate.expression,
      ),
    );
    const effect = { expression, hasEffects: true };

    if (terminator.completionBlock === continuation) return effect;

    return sequenceEffectExpression(
      effect,
      emitEffectBlockExpression(context, terminator.completionBlock, continuation, emitted),
    );
  }

  if (terminator instanceof IfTerminatorOp) {
    const consequent = emitEffectTargetExpression(
      context,
      terminator.thenTarget,
      terminator.completionBlock,
      emitted,
    );
    const alternate = emitEffectTargetExpression(
      context,
      terminator.elseTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(
        context.expressionForValue(terminator.condition),
        consequent.expression,
        alternate.expression,
      ),
    );
    const effect = { expression, hasEffects: true };

    if (terminator.completionBlock === continuation) return effect;

    return sequenceEffectExpression(
      effect,
      emitEffectBlockExpression(context, terminator.completionBlock, continuation, emitted),
    );
  }

  if (terminator instanceof ShortCircuitTerminatorOp) {
    const body = emitEffectTargetExpression(
      context,
      terminator.bodyTarget,
      terminator.completionBlock,
      emitted,
    );
    const exit = emitEffectTargetExpression(
      context,
      terminator.exitTarget,
      terminator.completionBlock,
      emitted,
    );
    const test = context.expressionForValue(terminator.test);
    const shortCircuitExpression = shortCircuitEffectExpression(terminator, test, body, exit);
    const expression = expressionWithStatements(statements, shortCircuitExpression);
    const effect = { expression, hasEffects: true };

    if (terminator.completionBlock === continuation) return effect;

    return sequenceEffectExpression(
      effect,
      emitEffectBlockExpression(context, terminator.completionBlock, continuation, emitted),
    );
  }

  if (terminator instanceof NullishGuardTerminatorOp) {
    const body = emitEffectTargetExpression(
      context,
      terminator.bodyTarget,
      terminator.completionBlock,
      emitted,
    );
    const exit = emitEffectTargetExpression(
      context,
      terminator.exitTarget,
      terminator.completionBlock,
      emitted,
    );
    const expression = expressionWithStatements(
      statements,
      conditionalExpression(
        binaryExpression("==", context.expressionForValue(terminator.guard), literal(null)),
        exit.expression,
        body.expression,
      ),
    );
    const effect = { expression, hasEffects: true };

    if (terminator.completionBlock === continuation) return effect;

    return sequenceEffectExpression(
      effect,
      emitEffectBlockExpression(context, terminator.completionBlock, continuation, emitted),
    );
  }

  throw new Error(`Effect block bb${block.id} cannot be emitted as an expression`);
}

function emitEffectTargetExpression(
  context: CodegenContext,
  target: BlockTarget,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
): EffectExpression {
  const entry = emitBlockTargetEntry(context, target, emitted, new Set([continuation]));
  const prefix = effectExpressionFromStatements(entry.prologue);

  if (entry.entryBlock === continuation) return prefix;

  return sequenceEffectExpression(
    prefix,
    emitEffectBlockExpression(context, entry.entryBlock, continuation, emitted),
  );
}

function shortCircuitEffectExpression(
  terminator: ShortCircuitTerminatorOp,
  test: ESTreeExpression,
  body: EffectExpression,
  exit: EffectExpression,
): ESTreeExpression {
  if (exit.hasEffects) {
    return conditionalExpression(
      shortCircuitBodyConditionExpression(terminator.operator, test),
      body.expression,
      exit.expression,
    );
  }

  switch (terminator.operator) {
    case "&&":
      return logicalExpression("&&", test, body.expression);
    case "||":
      return logicalExpression("||", test, body.expression);
    case "??":
      return logicalExpression("??", test, body.expression);
  }
}

function shortCircuitBodyConditionExpression(
  operator: ShortCircuitTerminatorOp["operator"],
  test: ESTreeExpression,
): ESTreeExpression {
  switch (operator) {
    case "&&":
      return test;
    case "||":
      return unaryExpression("!", test);
    case "??":
      return binaryExpression("==", test, literal(null));
  }
}

function effectExpressionFromStatements(statements: readonly ESTreeStatement[]): EffectExpression {
  if (statements.length === 0) {
    return { expression: literal(undefined), hasEffects: false };
  }

  return {
    expression: sequenceExpression(statements.map(expressionFromStatement)),
    hasEffects: true,
  };
}

function sequenceEffectExpression(
  left: EffectExpression,
  right: EffectExpression,
): EffectExpression {
  if (!left.hasEffects) return right;
  if (!right.hasEffects) return left;

  return {
    expression: sequenceExpression([left.expression, right.expression]),
    hasEffects: true,
  };
}

function emitValueBlockOperations(
  context: CodegenContext,
  block: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeStatement[] {
  if (emitted.has(block)) {
    throw new Error(`Value block bb${block.id} was already emitted`);
  }
  emitted.add(block);

  const statements: ESTreeStatement[] = [];
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;
    statements.push(...emitOperation(context, op));
  }

  return statements;
}

export function expressionWithStatements(
  statements: readonly ESTreeStatement[],
  expression: ESTreeExpression,
): ESTreeExpression {
  if (statements.length === 0) return expression;

  return sequenceExpression([...statements.map(expressionFromStatement), expression]);
}

function valueRegionResultParam(terminator: ValueRegionTerminator): Value {
  if (terminator.completionBlock.params.length !== 1) {
    throw new Error(
      `${terminator.constructor.name}#${terminator.id} exit block expected one result parameter, got ${terminator.completionBlock.params.length}`,
    );
  }

  return terminator.completionBlock.params[0];
}

function valueRegionExitExpression(
  context: CodegenContext,
  terminator: NullishGuardTerminatorOp,
): ESTreeExpression {
  const args = successorValues(terminator.exitTarget);
  if (args.length !== 1) {
    throw new Error(
      `NullishGuardTerminatorOp#${terminator.id} exit target expected one result, got ${args.length}`,
    );
  }

  return context.expressionForValue(args[0]);
}

function edgeResultExpression(
  statements: readonly ESTreeStatement[],
  result: boolean,
): ESTreeExpression {
  if (statements.length === 0) return literal(result);

  return sequenceExpression([...statements.map(expressionFromStatement), literal(result)]);
}

export function validateLoopTestEdges(
  terminator: LoopTestTerminator,
  trueExpected: BasicBlock,
  falseExpected: BasicBlock,
  label: string,
): void {
  const resolved = loopTestDecisionTerminator(terminator, trueExpected, falseExpected, label);

  if (resolved instanceof JumpTerminatorOp) {
    if (
      loopTestEdgeMatches(resolved.jumpTarget, trueExpected) ||
      loopTestEdgeMatches(resolved.jumpTarget, falseExpected)
    ) {
      return;
    }

    throw new Error(`${label} jump edge must target bb${trueExpected.id} or bb${falseExpected.id}`);
  }

  if (!loopTestEdgeMatches(resolved.trueTarget, trueExpected)) {
    throw new Error(`${label} true edge must target bb${trueExpected.id}`);
  }

  if (!loopTestEdgeMatches(resolved.falseTarget, falseExpected)) {
    throw new Error(`${label} false edge must target bb${falseExpected.id}`);
  }
}

function loopTestDecisionTerminator(
  terminator: LoopTestTerminator,
  trueExpected: BasicBlock,
  falseExpected: BasicBlock,
  label: string,
): BranchTerminatorOp | JumpTerminatorOp {
  if (terminator instanceof BranchTerminatorOp) return terminator;

  if (isValueRegionTerminator(terminator)) {
    return loopTestDecisionTerminator(
      loopTestTerminatorForValueRegion(terminator, label),
      trueExpected,
      falseExpected,
      label,
    );
  }

  if (
    loopTestEdgeMatches(terminator.jumpTarget, trueExpected) ||
    loopTestEdgeMatches(terminator.jumpTarget, falseExpected)
  ) {
    return terminator;
  }

  const entry = targetEntryBlock(terminator.jumpTarget, new Set([trueExpected, falseExpected]));
  return loopTestDecisionTerminator(
    loopTestTerminator(entry, `${label} jump target bb${entry.id}`),
    trueExpected,
    falseExpected,
    label,
  );
}

function loopTestEdgeMatches(target: BlockTarget, expected: BasicBlock): boolean {
  return targetEntryBlock(target, new Set([expected])) === expected;
}

function emitLoopTestEdge(
  context: CodegenContext,
  target: BlockTarget,
  continuation: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeStatement[] {
  const entry = emitBlockTargetEntry(context, target, emitted, new Set([continuation]));
  if (entry.entryBlock !== continuation) {
    throw new Error(
      `Loop test edge must target bb${continuation.id} directly or through an edge-copy block`,
    );
  }

  return entry.prologue;
}

interface EmittedBlockTargetEntry {
  readonly entryBlock: BasicBlock;
  readonly entryTarget: BlockTarget;
  readonly prologue: ESTreeStatement[];
}

function emitBlockTargetEntry(
  context: CodegenContext,
  target: BlockTarget,
  emitted: Set<BasicBlock>,
  stopBlocks: ReadonlySet<BasicBlock> = new Set(),
): EmittedBlockTargetEntry {
  const prologue = emitBlockTargetCopies(context, target);
  let entryTarget = target;
  let block = target.block;

  while (!stopBlocks.has(block) && !context.isFallthrough(block) && isEdgeCopyBlock(block)) {
    const terminator = block.terminator;
    if (!(terminator instanceof JumpTerminatorOp)) {
      throw new Error(`Edge-copy block bb${block.id} must end with JumpTerminatorOp`);
    }

    for (const op of block.operations) {
      if (op === terminator) continue;
      prologue.push(...emitOperation(context, op));
    }

    emitted.add(block);
    prologue.push(...emitBlockTargetCopies(context, terminator.jumpTarget));
    entryTarget = terminator.jumpTarget;
    block = terminator.targetBlock;
  }

  return { entryBlock: block, entryTarget, prologue };
}

function targetEntryBlock(
  target: BlockTarget,
  stopBlocks: ReadonlySet<BasicBlock> = new Set(),
): BasicBlock {
  let block = target.block;

  while (!stopBlocks.has(block) && isEdgeCopyBlock(block)) {
    const terminator = block.terminator;
    if (!(terminator instanceof JumpTerminatorOp)) {
      throw new Error(`Edge-copy block bb${block.id} must end with JumpTerminatorOp`);
    }

    block = terminator.targetBlock;
  }

  return block;
}

function isEdgeCopyBlock(block: BasicBlock): boolean {
  const terminator = block.terminator;
  if (!(terminator instanceof JumpTerminatorOp)) return false;

  let hasCopy = false;
  for (const op of block.operations) {
    if (op === terminator) continue;
    if (!(op instanceof CopyValueOp)) return false;
    hasCopy = true;
  }

  return hasCopy;
}

export function expressionFromStatement(statement: ESTreeStatement): ESTreeExpression {
  if (statement.type !== "ExpressionStatement") {
    throw new Error(
      `Loop test normalization only supports expression statements, got ${statement.type}`,
    );
  }

  return statement.expression;
}

function emitLoopTest(
  context: CodegenContext,
  block: BasicBlock,
  emitted: Set<BasicBlock>,
): ESTreeStatement[] {
  if (emitted.has(block)) return [];
  emitted.add(block);

  const statements: ESTreeStatement[] = [];
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;
    statements.push(...emitOperation(context, op));
  }

  return statements;
}

function emitBranch(
  context: CodegenContext,
  branch: BranchTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
): ESTreeStatement[] {
  const trueExit = jumpExit(branch.trueBlock);
  const falseExit = jumpExit(branch.falseBlock);
  const continuation = commonContinuation(branch, trueExit, falseExit);

  const consequent =
    branch.trueBlock === continuation
      ? []
      : emitBranchArm(context, branch.trueBlock, continuation, emitted, controls);
  const alternate =
    branch.falseBlock === continuation
      ? []
      : emitBranchArm(context, branch.falseBlock, continuation, emitted, controls);

  const statements: ESTreeStatement[] = [
    ifStatement(
      context.expressionForValue(branch.condition),
      blockStatement(consequent),
      alternate.length === 0 ? null : blockStatement(alternate),
    ),
  ];

  if (continuation !== null) {
    statements.push(...emitBlock(context, continuation, emitted, controls));
  }

  return statements;
}

function emitIf(
  context: CodegenContext,
  op: IfTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  return withFallthrough(context, op.completionBlock, emitted, controls, continuation, () => {
    const consequent = emitTargetArm(context, op.thenTarget, emitted, controls);
    const alternate = emitTargetArm(context, op.elseTarget, emitted, controls);

    return [
      ifStatement(
        context.expressionForValue(op.condition),
        blockStatement(consequent),
        alternate.length === 0 ? null : blockStatement(alternate),
      ),
    ];
  });
}

function emitConditional(
  context: CodegenContext,
  op: ConditionalTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  return withFallthrough(context, op.completionBlock, emitted, controls, continuation, () => {
    const consequent = emitTargetArm(context, op.consequentTarget, emitted, controls);
    const alternate = emitTargetArm(context, op.alternateTarget, emitted, controls);

    return [
      ifStatement(
        context.expressionForValue(op.test),
        blockStatement(consequent),
        alternate.length === 0 ? null : blockStatement(alternate),
      ),
    ];
  });
}

function emitShortCircuit(
  context: CodegenContext,
  op: ShortCircuitTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  return withFallthrough(context, op.completionBlock, emitted, controls, continuation, () => {
    const body = emitTargetArm(context, op.bodyTarget, emitted, controls);
    const exit = emitTargetArm(context, op.exitTarget, emitted, controls);

    return [
      ifStatement(
        shortCircuitBodyCondition(context, op),
        blockStatement(body),
        exit.length === 0 ? null : blockStatement(exit),
      ),
    ];
  });
}

function emitNullishGuard(
  context: CodegenContext,
  op: NullishGuardTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null = null,
): ESTreeStatement[] {
  return withFallthrough(context, op.completionBlock, emitted, controls, continuation, () => {
    const body = emitTargetArm(context, op.bodyTarget, emitted, controls);
    const exit = emitTargetArm(context, op.exitTarget, emitted, controls);

    return [
      ifStatement(
        binaryExpression("==", context.expressionForValue(op.guard), literal(null)),
        blockStatement(exit),
        body.length === 0 ? null : blockStatement(body),
      ),
    ];
  });
}

function shortCircuitBodyCondition(
  context: CodegenContext,
  op: ShortCircuitTerminatorOp,
): ESTreeExpression {
  const test = context.expressionForValue(op.test);

  switch (op.operator) {
    case "&&":
      return test;
    case "||":
      return unaryExpression("!", test);
    case "??":
      return binaryExpression("==", test, literal(null));
  }
}

function emitTargetArm(
  context: CodegenContext,
  target: BlockTarget,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
): ESTreeStatement[] {
  const entry = emitBlockTargetEntry(context, target, emitted, controlBoundaryBlocks(controls));
  const controlBreak = emitControlBreak(entry.entryBlock, controls);
  if (controlBreak !== null) {
    return [...entry.prologue, controlBreak];
  }

  const controlJump = emitControlJump(entry.entryBlock, controls);
  if (controlJump !== null) {
    return [...entry.prologue, controlJump];
  }

  if (context.isFallthrough(entry.entryBlock)) {
    return entry.prologue;
  }

  return [...entry.prologue, ...emitBlock(context, entry.entryBlock, emitted, controls)];
}

function emitTargetBranchArm(
  context: CodegenContext,
  target: BlockTarget,
  continuation: BasicBlock | null,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  options: EmitBranchArmOptions = {},
): ESTreeStatement[] {
  const entry = emitBlockTargetEntry(
    context,
    target,
    emitted,
    controlBoundaryBlocks(controls, continuation),
  );

  return [
    ...entry.prologue,
    ...emitBranchArm(context, entry.entryBlock, continuation, emitted, controls, options),
  ];
}

export function emitBranchArm(
  context: CodegenContext,
  block: BasicBlock,
  continuation: BasicBlock | null,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  options: EmitBranchArmOptions = {},
): ESTreeStatement[] {
  const implicitJumpTarget =
    options.implicitJumpTarget === undefined ? continuation : options.implicitJumpTarget;

  if (emitted.has(block)) return [];

  const forInOfLoop = forInOfLoopFromHeadBlock(block);
  if (forInOfLoop !== null) {
    return forInOfLoop.kind === "for-in"
      ? emitForIn(context, forInOfLoop.loop, emitted, controls, continuation, block)
      : emitForOf(context, forInOfLoop.loop, emitted, controls, continuation, block);
  }

  const initLoop = forLoopFromInitBlock(block);
  if (initLoop !== null) {
    return emitFor(context, initLoop, block, emitted, controls, continuation);
  }

  emitted.add(block);

  const statements: ESTreeStatement[] = [];
  const terminator = block.terminator;

  for (const op of block.operations) {
    if (op === terminator) continue;
    statements.push(...emitOperation(context, op));
  }

  if (terminator === null) return statements;

  if (terminator instanceof JumpTerminatorOp) {
    const entry = emitBlockTargetEntry(
      context,
      terminator.jumpTarget,
      emitted,
      controlBoundaryBlocks(controls, implicitJumpTarget),
    );
    const targetBlock = entry.entryBlock;
    const controlBreak = emitControlBreak(targetBlock, controls);
    if (controlBreak !== null) {
      statements.push(...entry.prologue);
      statements.push(controlBreak);
      return statements;
    }

    if (targetBlock === implicitJumpTarget) {
      statements.push(...entry.prologue);
      return statements;
    }

    const controlJump = emitControlJump(targetBlock, controls);
    if (controlJump !== null) {
      statements.push(...entry.prologue);
      statements.push(controlJump);
      return statements;
    }

    if (context.isFallthrough(targetBlock)) {
      statements.push(...entry.prologue);
      return statements;
    }

    if (!emitted.has(targetBlock)) {
      statements.push(...entry.prologue);
      statements.push(...emitContinuation(context, targetBlock, continuation, emitted, controls));
      return statements;
    }

    throw new Error(
      `Cannot emit jump from bb${block.id} to bb${targetBlock.id}; expected structured continuation`,
    );
  }

  if (terminator instanceof TryTerminatorOp) {
    statements.push(...emitTry(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof IfTerminatorOp) {
    statements.push(...emitIf(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof ConditionalTerminatorOp) {
    statements.push(...emitConditional(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof ShortCircuitTerminatorOp) {
    statements.push(...emitShortCircuit(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof NullishGuardTerminatorOp) {
    statements.push(...emitNullishGuard(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof BranchTerminatorOp) {
    statements.push(...emitBranch(context, terminator, emitted, controls));
    return statements;
  }

  if (terminator instanceof SwitchTerminatorOp) {
    statements.push(...emitSwitch(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof LabeledTerminatorOp) {
    statements.push(...emitLabeled(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof WhileTerminatorOp) {
    statements.push(...emitWhile(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof ForInTerminatorOp) {
    statements.push(...emitForIn(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof ForOfTerminatorOp) {
    statements.push(...emitForOf(context, terminator, emitted, controls, continuation));
    return statements;
  }

  if (terminator instanceof ForTerminatorOp) {
    statements.push(...emitFor(context, terminator, null, emitted, controls, continuation));
    return statements;
  }

  statements.push(...emitOperation(context, terminator));
  return statements;
}

function emitJump(
  context: CodegenContext,
  jump: JumpTerminatorOp,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
): ESTreeStatement[] {
  const entry = emitBlockTargetEntry(
    context,
    jump.jumpTarget,
    emitted,
    controlBoundaryBlocks(controls),
  );
  const targetBlock = entry.entryBlock;
  const controlBreak = emitControlBreak(targetBlock, controls);
  if (controlBreak !== null) {
    return [...entry.prologue, controlBreak];
  }

  const controlJump = emitControlJump(targetBlock, controls);
  if (controlJump !== null) {
    return [...entry.prologue, controlJump];
  }

  if (context.isFallthrough(targetBlock)) {
    return entry.prologue;
  }

  const forLoop = forLoopFromInitBlock(targetBlock);
  if (forLoop !== null) {
    return [...entry.prologue, ...emitFor(context, forLoop, targetBlock, emitted, controls)];
  }

  if (emitted.has(targetBlock)) {
    return [];
  }

  return [...entry.prologue, ...emitBlock(context, targetBlock, emitted, controls)];
}

function forLoopFromInitBlock(block: BasicBlock): ForTerminatorOp | null {
  const terminator = block.terminator;
  if (!(terminator instanceof JumpTerminatorOp)) return null;

  const loopTerminator = terminator.targetBlock.terminator;
  if (!(loopTerminator instanceof ForTerminatorOp)) return null;
  if (loopTerminator.initTarget?.block !== block) return null;

  return loopTerminator;
}

type ForInOfLoopFromHeadBlock =
  | { readonly kind: "for-in"; readonly loop: ForInTerminatorOp }
  | { readonly kind: "for-of"; readonly loop: ForOfTerminatorOp };

function forInOfLoopFromHeadBlock(block: BasicBlock): ForInOfLoopFromHeadBlock | null {
  const terminator = block.terminator;
  if (terminator === null) return null;

  if (terminator instanceof JumpTerminatorOp) {
    return forInOfLoopFromHeadJump(terminator);
  }

  if (isValueRegionTerminator(terminator)) {
    return forInOfLoopFromCompletionBlock(terminator.completionBlock);
  }

  return null;
}

function forInOfLoopFromHeadJump(terminator: JumpTerminatorOp): ForInOfLoopFromHeadBlock | null {
  const result = forInOfLoopFromCompletionBlock(terminator.targetBlock);
  if (result === null) return null;

  const args = successorValues(terminator.jumpTarget);
  if (args.length !== 1) return null;

  const loopValue = result.kind === "for-in" ? result.loop.object : result.loop.iterable;
  if (args[0] === loopValue) return null;

  return result;
}

function forInOfLoopFromCompletionBlock(block: BasicBlock): ForInOfLoopFromHeadBlock | null {
  const terminator = block.terminator;
  if (terminator instanceof ForInTerminatorOp) return { kind: "for-in", loop: terminator };
  if (terminator instanceof ForOfTerminatorOp) return { kind: "for-of", loop: terminator };
  if (terminator instanceof JumpTerminatorOp) return forInOfLoopFromHeadJump(terminator);

  return null;
}

function emitContinuation(
  context: CodegenContext,
  block: BasicBlock,
  continuation: BasicBlock | null,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
): ESTreeStatement[] {
  return continuation === null
    ? emitBlock(context, block, emitted, controls)
    : emitBranchArm(context, block, continuation, emitted, controls);
}

export function withFallthrough(
  context: CodegenContext,
  fallthroughBlock: BasicBlock,
  emitted: Set<BasicBlock>,
  controls: readonly EmitControlContext[],
  continuation: BasicBlock | null,
  emitRegion: () => ESTreeStatement[],
): ESTreeStatement[] {
  context.pushFallthrough(fallthroughBlock);

  let statements: ESTreeStatement[];
  try {
    statements = emitRegion();
  } finally {
    context.popFallthrough(fallthroughBlock);
  }

  if (!emitted.has(fallthroughBlock)) {
    statements.push(
      ...emitContinuation(context, fallthroughBlock, continuation, emitted, controls),
    );
  }

  return statements;
}

function emitControlBreak(
  target: BasicBlock,
  controls: readonly EmitControlContext[],
): ESTreeStatement | null {
  const topControl = controls[controls.length - 1];
  if (topControl !== undefined && target === topControl.breakTarget) {
    const label =
      topControl.requireLabel === true && topControl.label !== null
        ? identifier(topControl.label)
        : null;
    return breakStatement(label);
  }

  for (let index = controls.length - 1; index >= 0; index--) {
    const control = controls[index];
    if (control.label === null) continue;
    if (target === control.breakTarget) {
      return breakStatement(identifier(control.label));
    }
  }

  return null;
}

function emitControlJump(
  target: BasicBlock,
  controls: readonly EmitControlContext[],
): ESTreeStatement | null {
  const controlContinue = emitControlContinue(target, controls);
  if (controlContinue !== null) return controlContinue;

  for (let index = controls.length - 1; index >= 0; index--) {
    const control = controls[index];
    const needsLabel = control.requireLabel === true || index !== controls.length - 1;
    if (needsLabel && control.label === null) continue;

    const label = needsLabel && control.label !== null ? identifier(control.label) : null;

    if (target === control.continueTarget) {
      return continueStatement(label);
    }

    if (target === control.breakTarget) {
      return breakStatement(label);
    }
  }

  return null;
}

function emitControlContinue(
  target: BasicBlock,
  controls: readonly EmitControlContext[],
): ESTreeStatement | null {
  let hasInnerLoop = false;

  for (let index = controls.length - 1; index >= 0; index--) {
    const control = controls[index];
    if (target === control.continueTarget) {
      if (!hasInnerLoop) return continueStatement(null);
      if (control.label !== null) return continueStatement(identifier(control.label));
      return null;
    }

    if (control.continueTarget !== null) {
      hasInnerLoop = true;
    }
  }

  return null;
}

function controlBoundaryBlocks(
  controls: readonly EmitControlContext[],
  extra: BasicBlock | null = null,
): Set<BasicBlock> {
  const blocks = new Set<BasicBlock>();
  if (extra !== null) blocks.add(extra);

  for (const control of controls) {
    blocks.add(control.breakTarget);
    if (control.continueTarget !== null) blocks.add(control.continueTarget);
  }

  return blocks;
}

export function withOptionalLabel(
  label: string | null,
  statement: ESTreeStatement,
): ESTreeStatement {
  return label === null ? statement : labeledStatement(identifier(label), statement);
}

function emitBlockTargetCopies(context: CodegenContext, target: BlockTarget): ESTreeStatement[] {
  const params = target.block.params;
  const args = successorValues(target);

  if (params.length !== args.length) {
    throw new Error(
      `Branch to bb${target.block.id} passes ${args.length} values for ${params.length} block params`,
    );
  }

  const assignments: ESTreeStatement[] = [];

  for (let index = 0; index < params.length; index++) {
    if (params[index] === args[index]) continue;

    assignments.push(
      expressionStatement(
        assignmentExpression(
          identifier(context.names.valueName(params[index])),
          context.expressionForValue(args[index]),
        ),
      ),
    );
  }

  return assignments;
}

function jumpExit(block: BasicBlock): JumpTerminatorOp | null {
  const terminator = block.terminator;
  return terminator instanceof JumpTerminatorOp ? terminator : null;
}

function commonContinuation(
  branch: BranchTerminatorOp,
  trueExit: JumpTerminatorOp | null,
  falseExit: JumpTerminatorOp | null,
): BasicBlock | null {
  if (trueExit !== null && falseExit !== null) {
    if (trueExit.targetBlock !== falseExit.targetBlock) {
      if (jumpExit(trueExit.targetBlock)?.targetBlock === falseExit.targetBlock) {
        return trueExit.targetBlock;
      }

      if (jumpExit(falseExit.targetBlock)?.targetBlock === trueExit.targetBlock) {
        return falseExit.targetBlock;
      }

      throw new Error(`Branch bb${branch.ownerBlock?.id} has non-joining successors`);
    }

    return trueExit.targetBlock;
  }

  if (trueExit !== null && branch.falseBlock === trueExit.targetBlock) {
    return branch.falseBlock;
  }

  if (falseExit !== null && branch.trueBlock === falseExit.targetBlock) {
    return branch.trueBlock;
  }

  if (trueExit !== null) return trueExit.targetBlock;
  if (falseExit !== null) return falseExit.targetBlock;

  const trueStructuredExit = structuredExit(branch.trueBlock);
  const falseStructuredExit = structuredExit(branch.falseBlock);

  if (trueStructuredExit !== null && falseStructuredExit !== null) {
    if (trueStructuredExit !== falseStructuredExit) {
      throw new Error(`Branch bb${branch.ownerBlock?.id} has non-joining successors`);
    }

    return trueStructuredExit;
  }

  if (trueStructuredExit !== null && branch.falseBlock === trueStructuredExit) {
    return branch.falseBlock;
  }

  if (falseStructuredExit !== null && branch.trueBlock === falseStructuredExit) {
    return branch.trueBlock;
  }

  if (
    trueStructuredExit !== null &&
    jumpExit(trueStructuredExit)?.targetBlock === branch.falseBlock
  ) {
    return branch.falseBlock;
  }

  if (
    falseStructuredExit !== null &&
    jumpExit(falseStructuredExit)?.targetBlock === branch.trueBlock
  ) {
    return branch.trueBlock;
  }

  if (trueStructuredExit !== null) return trueStructuredExit;
  if (falseStructuredExit !== null) return falseStructuredExit;

  return null;
}

function structuredExit(block: BasicBlock): BasicBlock | null {
  const terminator = block.terminator;

  if (terminator instanceof LabeledTerminatorOp) return terminator.exitBlock;
  if (terminator instanceof ForInTerminatorOp || terminator instanceof ForOfTerminatorOp) {
    return terminator.continuationBlock;
  }

  if (terminator instanceof WhileTerminatorOp || terminator instanceof ForTerminatorOp) {
    return terminator.exitBlock;
  }

  if (
    terminator instanceof SwitchTerminatorOp ||
    terminator instanceof IfTerminatorOp ||
    terminator instanceof TryTerminatorOp
  ) {
    return terminator.completionBlock;
  }

  return null;
}
