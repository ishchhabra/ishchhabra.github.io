import type { FunctionIR } from "./FunctionIR";
import type { OperationCloneContext } from "./OperationCloneContext";
import type { DeclarationId, Value } from "./Value";

/**
 * Expression embedded in a destructuring pattern.
 *
 * Pattern expressions are separate from ordinary SSA expression values because
 * destructuring controls when they run.
 */
export type PatternExpression =
  | {
      /**
       * Already-lowered expression result.
       *
       * This form is used after a rewrite or lowering pass has materialized a
       * pattern expression into the surrounding IR.
       *
       * @example
       * ```txt
       * kind: "value"
       * ```
       */
      readonly kind: "value";
      readonly value: Value;
    }
  | {
      /**
       * Deferred expression region.
       *
       * This form preserves source evaluation timing for expressions that must
       * run inside destructuring evaluation rather than where the pattern is
       * lowered.
       *
       * @example
       * ```js
       * const { x = fallback() } = value;
       * ```
       */
      readonly kind: "deferred";
      readonly functionIR: FunctionIR;
    };

/**
 * Property key used by object binding and assignment patterns.
 *
 * Pattern keys are separate from runtime property keys because computed
 * destructuring keys may need delayed expression evaluation.
 */
export type PatternPropertyKey =
  | {
      /**
       * Static object-pattern property key.
       *
       * @example
       * ```js
       * const { x: y } = value;
       * const { "x": y } = value;
       * ```
       */
      readonly kind: "static";
      readonly name: string;
    }
  | {
      /**
       * Computed object-pattern property key.
       *
       * The key expression is stored as a `PatternExpression` because
       * `{ [expr]: y }` evaluates `expr` as part of object-pattern evaluation.
       *
       * @example
       * ```js
       * const { [key()]: y } = value;
       * ```
       */
      readonly kind: "computed";
      readonly expression: PatternExpression;
    };

/**
 * Runtime write used for a binding pattern target.
 *
 * @example Lexical declaration
 * ```js
 * const { x } = obj;
 * ```
 * Uses `"initialize"` because `x` is a lexical binding initialized when the
 * declaration executes.
 *
 * @example Var declaration
 * ```js
 * var { x } = obj;
 * ```
 * Uses `"store"` because `x` was already initialized to `undefined` during
 * declaration instantiation.
 */
export type BindingWriteMode = "initialize" | "store";

/**
 * Compiler-owned target tree for ECMAScript binding patterns.
 *
 * Binding patterns appear in declarations, parameters, and catch clauses.
 *
 * @example Declaration pattern
 * ```js
 * const { x, y: [z = 1]} = value;
 * ```
 * Represents a declaration binding pattern. The leaves are declaration ids,
 * not assignment references.
 *
 * @example Parameter pattern
 * ```js
 * function f({ x }) {}
 * ```
 * Function parameters are also binding patterns.
 */
export type BindingPatternTarget =
  | {
      readonly kind: "binding";
      readonly declarationId: DeclarationId;
      readonly bindingValue: Value;
    }
  | {
      readonly kind: "array";
      readonly elements: readonly (BindingPatternTarget | null)[];
    }
  | {
      readonly kind: "object";
      readonly properties: readonly ObjectBindingProperty[];
    }
  | { readonly kind: "rest"; readonly target: BindingPatternTarget }
  | {
      readonly kind: "default";
      readonly target: BindingPatternTarget;
      readonly expression: PatternExpression;
    };

/**
 * One property in an object binding pattern.
 *
 * @example Shorthand binding
 * ```js
 * const { x } = obj;
 * ```
 * The property key is `"x"` and the target is binding `x`.
 *
 * @example Renamed binding
 * ```js
 * const { x: y } = obj;
 * ```
 * The property key is `"x"` and the target is binding `y`.
 *
 * @example Computed binding
 * ```js
 * const { [key]: value } = obj;
 * ```
 * The property key is computed from `key` and the target is binding `value`.
 */
export type ObjectBindingProperty =
  | {
      readonly kind: "property";
      readonly key: PatternPropertyKey;
      readonly target: BindingPatternTarget;
    }
  | {
      readonly kind: "rest";
      readonly target: BindingPatternTarget;
    };

export interface BindingPatternBinding {
  readonly declarationId: DeclarationId;
  readonly bindingValue: Value;
}

/**
 * Compiler-owned target tree for ECMAScript assignment patterns.
 *
 * Assignment patterns appear in assignment expressions and write to existing
 * references rather than declaring new bindings.
 *
 * @example Binding assignment
 * ```js
 * ({ x } = value);
 * ```
 * Assigns to existing binding `x`.
 *
 * @example Property assignment
 * ```js
 * ({ x: obj.y } = value);
 * ```
 * Assigns to property `obj.y`.
 */
export type AssignmentPatternTarget =
  | {
      readonly kind: "binding";
      readonly declarationId: DeclarationId;
      readonly bindingValue: Value;
    }
  | {
      readonly kind: "static-property";
      readonly object: Value;
      readonly key: string;
    }
  | {
      readonly kind: "dynamic-property";
      readonly object: Value;
      readonly key: Value;
    }
  | {
      readonly kind: "array";
      readonly elements: readonly (AssignmentPatternTarget | null)[];
    }
  | {
      readonly kind: "object";
      readonly properties: readonly ObjectAssignmentProperty[];
    }
  | { readonly kind: "rest"; readonly target: AssignmentPatternTarget }
  | {
      readonly kind: "default";
      readonly target: AssignmentPatternTarget;
      readonly expression: PatternExpression;
    };

/**
 * One property entry in an object assignment pattern.
 *
 * @example Binding assignment
 * ```js
 * ({ x } = obj);
 * ```
 * The property key is `"x"` and the target is existing binding `x`.
 *
 * @example Property assignment
 * ```js
 * ({ x: target.y } = obj);
 * ```
 * The property key is `"x"` and the target is property `target.y`.
 *
 * @example Computed key
 * ```js
 * ({ [key]: value } = obj);
 * ```
 * The property key is computed from `key` and the target is existing binding
 * `value`.
 */
export type ObjectAssignmentProperty =
  | {
      readonly kind: "property";
      readonly key: PatternPropertyKey;
      readonly target: AssignmentPatternTarget;
    }
  | {
      readonly kind: "rest";
      readonly target: AssignmentPatternTarget;
    };

export interface AssignmentPatternBinding {
  readonly declarationId: DeclarationId;
  readonly bindingValue: Value;
}

export function bindingPatternOperands(target: BindingPatternTarget): readonly Value[] {
  switch (target.kind) {
    case "binding":
      return [];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : bindingPatternOperands(element),
      );

    case "object":
      return target.properties.flatMap((property) =>
        property.kind === "rest"
          ? bindingPatternOperands(property.target)
          : [...propertyKeyOperands(property.key), ...bindingPatternOperands(property.target)],
      );

    case "rest":
      return bindingPatternOperands(target.target);

    case "default":
      return [
        ...patternExpressionOperands(target.expression),
        ...bindingPatternOperands(target.target),
      ];
  }
}

export function bindingPatternBindings(
  target: BindingPatternTarget,
): readonly BindingPatternBinding[] {
  switch (target.kind) {
    case "binding":
      return [{ declarationId: target.declarationId, bindingValue: target.bindingValue }];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : bindingPatternBindings(element),
      );

    case "object":
      return target.properties.flatMap((property) => bindingPatternBindings(property.target));

    case "rest":
      return bindingPatternBindings(target.target);

    case "default":
      return bindingPatternBindings(target.target);
  }
}

export function assignmentPatternOperands(target: AssignmentPatternTarget): readonly Value[] {
  switch (target.kind) {
    case "binding":
      return [];

    case "static-property":
      return [target.object];

    case "dynamic-property":
      return [target.object, target.key];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : assignmentPatternOperands(element),
      );

    case "object":
      return target.properties.flatMap((property) =>
        property.kind === "rest"
          ? assignmentPatternOperands(property.target)
          : [...propertyKeyOperands(property.key), ...assignmentPatternOperands(property.target)],
      );

    case "rest":
      return assignmentPatternOperands(target.target);

    case "default":
      return [
        ...patternExpressionOperands(target.expression),
        ...assignmentPatternOperands(target.target),
      ];
  }
}

export function assignmentPatternBindings(
  target: AssignmentPatternTarget,
): readonly AssignmentPatternBinding[] {
  switch (target.kind) {
    case "binding":
      return [{ declarationId: target.declarationId, bindingValue: target.bindingValue }];

    case "static-property":
    case "dynamic-property":
      return [];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : assignmentPatternBindings(element),
      );

    case "object":
      return target.properties.flatMap((property) => assignmentPatternBindings(property.target));

    case "rest":
      return assignmentPatternBindings(target.target);

    case "default":
      return assignmentPatternBindings(target.target);
  }
}

function propertyKeyOperands(key: PatternPropertyKey): readonly Value[] {
  return key.kind === "computed" ? patternExpressionOperands(key.expression) : [];
}

function patternExpressionOperands(expression: PatternExpression): readonly Value[] {
  return expression.kind === "value" ? [expression.value] : [];
}

export function rewriteBindingPatternOperands(
  target: BindingPatternTarget,
  operands: readonly Value[],
): BindingPatternTarget {
  const [rewritten, nextIndex] = rewriteBindingPatternOperandsAt(target, operands, 0);

  if (nextIndex !== operands.length) {
    throw new Error(`Expected ${nextIndex} binding pattern operands, got ${operands.length}`);
  }

  return rewritten;
}

function rewriteBindingPatternOperandsAt(
  target: BindingPatternTarget,
  operands: readonly Value[],
  index: number,
): readonly [BindingPatternTarget, number] {
  switch (target.kind) {
    case "binding":
      return [target, index];

    case "array": {
      let nextIndex = index;
      const elements = target.elements.map((element) => {
        if (element === null) return null;

        const [rewritten, after] = rewriteBindingPatternOperandsAt(element, operands, nextIndex);
        nextIndex = after;
        return rewritten;
      });

      return [{ kind: "array", elements }, nextIndex];
    }

    case "object": {
      let nextIndex = index;
      const properties = target.properties.map((property) => {
        if (property.kind === "rest") {
          const [rewrittenTarget, afterTarget] = rewriteBindingPatternOperandsAt(
            property.target,
            operands,
            nextIndex,
          );

          nextIndex = afterTarget;

          return {
            kind: "rest" as const,
            target: rewrittenTarget,
          };
        }

        const [key, afterKey] = rewritePropertyKeyOperand(property.key, operands, nextIndex);
        const [rewrittenTarget, afterTarget] = rewriteBindingPatternOperandsAt(
          property.target,
          operands,
          afterKey,
        );

        nextIndex = afterTarget;

        return {
          kind: "property" as const,
          key,
          target: rewrittenTarget,
        };
      });

      return [{ kind: "object", properties }, nextIndex];
    }

    case "rest": {
      const [rewritten, nextIndex] = rewriteBindingPatternOperandsAt(
        target.target,
        operands,
        index,
      );

      return [{ kind: "rest", target: rewritten }, nextIndex];
    }

    case "default": {
      const [expression, afterExpression] = rewritePatternExpressionOperand(
        target.expression,
        operands,
        index,
      );
      const [rewritten, nextIndex] = rewriteBindingPatternOperandsAt(
        target.target,
        operands,
        afterExpression,
      );

      return [
        {
          kind: "default",
          target: rewritten,
          expression,
        },
        nextIndex,
      ];
    }
  }
}

export function rewriteAssignmentPatternOperands(
  target: AssignmentPatternTarget,
  operands: readonly Value[],
): AssignmentPatternTarget {
  const [rewritten, nextIndex] = rewriteAssignmentPatternOperandsAt(target, operands, 0);

  if (nextIndex !== operands.length) {
    throw new Error(`Expected ${nextIndex} assignment pattern operands, got ${operands.length}`);
  }

  return rewritten;
}

function rewriteAssignmentPatternOperandsAt(
  target: AssignmentPatternTarget,
  operands: readonly Value[],
  index: number,
): readonly [AssignmentPatternTarget, number] {
  switch (target.kind) {
    case "binding":
      return [target, index];

    case "static-property": {
      return [
        {
          ...target,
          object: operands[index],
        },
        index + 1,
      ];
    }

    case "dynamic-property": {
      return [
        {
          ...target,
          object: operands[index],
          key: operands[index + 1],
        },
        index + 2,
      ];
    }

    case "array": {
      let nextIndex = index;
      const elements = target.elements.map((element) => {
        if (element === null) return null;

        const [rewritten, after] = rewriteAssignmentPatternOperandsAt(element, operands, nextIndex);
        nextIndex = after;
        return rewritten;
      });

      return [{ kind: "array", elements }, nextIndex];
    }

    case "object": {
      let nextIndex = index;
      const properties = target.properties.map((property) => {
        if (property.kind === "rest") {
          const [rewrittenTarget, afterTarget] = rewriteAssignmentPatternOperandsAt(
            property.target,
            operands,
            nextIndex,
          );

          nextIndex = afterTarget;

          return {
            kind: "rest" as const,
            target: rewrittenTarget,
          };
        }

        const [key, afterKey] = rewritePropertyKeyOperand(property.key, operands, nextIndex);
        const [rewrittenTarget, afterTarget] = rewriteAssignmentPatternOperandsAt(
          property.target,
          operands,
          afterKey,
        );

        nextIndex = afterTarget;

        return {
          kind: "property" as const,
          key,
          target: rewrittenTarget,
        };
      });

      return [{ kind: "object", properties }, nextIndex];
    }

    case "rest": {
      const [rewritten, nextIndex] = rewriteAssignmentPatternOperandsAt(
        target.target,
        operands,
        index,
      );

      return [{ kind: "rest", target: rewritten }, nextIndex];
    }

    case "default": {
      const [expression, afterExpression] = rewritePatternExpressionOperand(
        target.expression,
        operands,
        index,
      );
      const [rewritten, nextIndex] = rewriteAssignmentPatternOperandsAt(
        target.target,
        operands,
        afterExpression,
      );

      return [
        {
          kind: "default",
          target: rewritten,
          expression,
        },
        nextIndex,
      ];
    }
  }
}

function rewritePropertyKeyOperand(
  key: PatternPropertyKey,
  operands: readonly Value[],
  index: number,
): readonly [PatternPropertyKey, number] {
  if (key.kind !== "computed") return [key, index];

  const [expression, nextIndex] = rewritePatternExpressionOperand(key.expression, operands, index);
  return [{ kind: "computed", expression }, nextIndex];
}

function rewritePatternExpressionOperand(
  expression: PatternExpression,
  operands: readonly Value[],
  index: number,
): readonly [PatternExpression, number] {
  if (expression.kind === "deferred") return [expression, index];

  return [{ kind: "value", value: operands[index] }, index + 1];
}

export function cloneBindingPatternTarget(
  context: OperationCloneContext,
  target: BindingPatternTarget,
): BindingPatternTarget {
  switch (target.kind) {
    case "binding":
      return {
        ...target,
        bindingValue: context.result(target.bindingValue),
      };

    case "array":
      return {
        kind: "array",
        elements: target.elements.map((element) =>
          element === null ? null : cloneBindingPatternTarget(context, element),
        ),
      };

    case "object":
      return {
        kind: "object",
        properties: target.properties.map((property) =>
          property.kind === "rest"
            ? {
                kind: "rest",
                target: cloneBindingPatternTarget(context, property.target),
              }
            : {
                kind: "property",
                key: clonePropertyKey(context, property.key),
                target: cloneBindingPatternTarget(context, property.target),
              },
        ),
      };

    case "rest":
      return {
        kind: "rest",
        target: cloneBindingPatternTarget(context, target.target),
      };

    case "default":
      return {
        kind: "default",
        target: cloneBindingPatternTarget(context, target.target),
        expression: clonePatternExpression(context, target.expression),
      };
  }
}

export function cloneAssignmentPatternTarget(
  context: OperationCloneContext,
  target: AssignmentPatternTarget,
): AssignmentPatternTarget {
  switch (target.kind) {
    case "binding":
      return {
        ...target,
        bindingValue: context.result(target.bindingValue),
      };

    case "static-property":
      return {
        ...target,
        object: context.value(target.object),
      };

    case "dynamic-property":
      return {
        ...target,
        object: context.value(target.object),
        key: context.value(target.key),
      };

    case "array":
      return {
        kind: "array",
        elements: target.elements.map((element) =>
          element === null ? null : cloneAssignmentPatternTarget(context, element),
        ),
      };

    case "object":
      return {
        kind: "object",
        properties: target.properties.map((property) =>
          property.kind === "rest"
            ? {
                kind: "rest",
                target: cloneAssignmentPatternTarget(context, property.target),
              }
            : {
                kind: "property",
                key: clonePropertyKey(context, property.key),
                target: cloneAssignmentPatternTarget(context, property.target),
              },
        ),
      };

    case "rest":
      return {
        kind: "rest",
        target: cloneAssignmentPatternTarget(context, target.target),
      };

    case "default":
      return {
        kind: "default",
        target: cloneAssignmentPatternTarget(context, target.target),
        expression: clonePatternExpression(context, target.expression),
      };
  }
}

function clonePropertyKey(
  context: OperationCloneContext,
  key: PatternPropertyKey,
): PatternPropertyKey {
  return key.kind === "computed"
    ? { kind: "computed", expression: clonePatternExpression(context, key.expression) }
    : key;
}

function clonePatternExpression(
  context: OperationCloneContext,
  expression: PatternExpression,
): PatternExpression {
  return expression.kind === "value"
    ? { kind: "value", value: context.value(expression.value) }
    : expression;
}
