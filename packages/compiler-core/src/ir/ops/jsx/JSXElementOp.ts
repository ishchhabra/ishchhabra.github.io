import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Name used by a JSX element or attribute.
 *
 * Intrinsic names such as `div` are syntax-only. Component names such as
 * `Button` carry a value operand so def-use analysis can see the JavaScript
 * binding dependency without lowering JSX into a target runtime.
 *
 * @example
 * ```jsx
 * <div />
 * <Button />
 * <UI.Button />
 * <svg:path />
 * ```
 */
export type JSXName = JSXIntrinsicName | JSXReferenceName | JSXMemberName | JSXNamespaceName;

/**
 * Lowercase JSX tag name that does not resolve through JavaScript scope.
 *
 * @example
 * ```jsx
 * <div />
 * ```
 */
export interface JSXIntrinsicName {
  readonly kind: "intrinsic";
  readonly name: string;
}

/**
 * JSX tag name that resolves to a JavaScript binding.
 *
 * `sourceName` preserves the spelling used in JSX. `value` is the loaded
 * binding value used by def-use analysis, renaming, and later JSX transforms.
 *
 * @example
 * ```jsx
 * <Button />
 * ```
 */
export interface JSXReferenceName {
  readonly kind: "reference";
  readonly sourceName: string;
  readonly value: Value;
}

/**
 * Dotted JSX member name.
 *
 * The object side may contain a binding reference; the property segment is
 * syntax-only because JSX tag names do not allow arbitrary computed names.
 *
 * @example
 * ```jsx
 * <UI.Button />
 * ```
 */
export interface JSXMemberName {
  readonly kind: "member";
  readonly object: JSXName;
  readonly property: string;
}

/**
 * JSX namespaced name.
 *
 * @example
 * ```jsx
 * <svg:path />
 * ```
 */
export interface JSXNamespaceName {
  readonly kind: "namespace";
  readonly namespace: string;
  readonly name: string;
}

/**
 * Attribute attached to a JSX opening element.
 *
 * @example
 * ```jsx
 * <input disabled value={text} {...props} />
 * ```
 */
export type JSXAttribute = JSXNamedAttribute | JSXSpreadAttribute;

/**
 * Named JSX attribute.
 *
 * `value: null` represents boolean shorthand syntax.
 *
 * @example
 * ```jsx
 * <input disabled />
 * <input value={text} />
 * ```
 */
export interface JSXNamedAttribute {
  readonly kind: "attribute";
  readonly name: JSXName;
  readonly value: JSXAttributeValue | null;
}

/**
 * JSX spread attribute.
 *
 * @example
 * ```jsx
 * <Component {...props} />
 * ```
 */
export interface JSXSpreadAttribute {
  readonly kind: "spread";
  readonly argument: Value;
}

/**
 * Runtime or literal value of a named JSX attribute.
 */
export type JSXAttributeValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "expression"; readonly value: Value }
  | { readonly kind: "node"; readonly value: Value };

/**
 * Child entry inside a JSX element or fragment.
 *
 * @example
 * ```jsx
 * <div>Hello {name}<span /></div>
 * ```
 */
export type JSXChild =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "expression"; readonly value: Value }
  | { readonly kind: "spread"; readonly value: Value }
  | { readonly kind: "node"; readonly value: Value };

/**
 * Creates a JSX element value while preserving JSX source structure.
 *
 * This op does not lower JSX into `React.createElement`, `_jsx`, or DOM
 * construction. Those are later target-specific transforms.
 *
 * @example
 * ```jsx
 * <Button disabled label={name} />
 * ```
 */
export class JSXElementOp extends Operation {
  public constructor(
    id: OperationId,
    public readonly name: JSXName,
    public readonly attributes: readonly JSXAttribute[],
    public readonly children: readonly JSXChild[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [
      ...jsxNameOperands(this.name),
      ...this.attributes.flatMap(attributeOperands),
      ...this.children.flatMap(childOperands),
    ];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): JSXElementOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `JSXElementOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    let index = 0;

    return new JSXElementOp(
      this.id,
      mapJSXNameOperands(this.name, () => operands[index++]),
      this.attributes.map((attribute) => mapAttributeOperands(attribute, () => operands[index++])),
      this.children.map((child) => mapChildOperands(child, () => operands[index++])),
      this.result,
    );
  }

  public override clone(context: OperationCloneContext): JSXElementOp {
    return new JSXElementOp(
      context.ids.operationId(),
      cloneJSXName(context, this.name),
      this.attributes.map((attribute) => cloneAttribute(context, attribute)),
      this.children.map((child) => cloneChild(context, child)),
      context.result(this.result),
    );
  }
}

export function jsxNameOperands(name: JSXName): readonly Value[] {
  switch (name.kind) {
    case "intrinsic":
    case "namespace":
      return [];

    case "reference":
      return [name.value];

    case "member":
      return jsxNameOperands(name.object);
  }
}

export function attributeOperands(attribute: JSXAttribute): readonly Value[] {
  switch (attribute.kind) {
    case "spread":
      return [attribute.argument];

    case "attribute":
      return [...jsxNameOperands(attribute.name), ...attributeValueOperands(attribute.value)];
  }
}

export function attributeValueOperands(value: JSXAttributeValue | null): readonly Value[] {
  if (value === null || value.kind === "string") return [];
  return [value.value];
}

export function childOperands(child: JSXChild): readonly Value[] {
  return child.kind === "text" ? [] : [child.value];
}

export function cloneJSXName(context: OperationCloneContext, name: JSXName): JSXName {
  return mapJSXNameOperands(name, (value) => context.value(value));
}

export function cloneAttribute(
  context: OperationCloneContext,
  attribute: JSXAttribute,
): JSXAttribute {
  return mapAttributeOperands(attribute, (value) => context.value(value));
}

export function cloneChild(context: OperationCloneContext, child: JSXChild): JSXChild {
  return mapChildOperands(child, (value) => context.value(value));
}

export function mapJSXNameOperands(name: JSXName, next: (value: Value) => Value): JSXName {
  switch (name.kind) {
    case "intrinsic":
    case "namespace":
      return name;

    case "reference":
      return { ...name, value: next(name.value) };

    case "member":
      return {
        ...name,
        object: mapJSXNameOperands(name.object, next),
      };
  }
}

export function mapAttributeOperands(
  attribute: JSXAttribute,
  next: (value: Value) => Value,
): JSXAttribute {
  switch (attribute.kind) {
    case "spread":
      return { ...attribute, argument: next(attribute.argument) };

    case "attribute":
      return {
        ...attribute,
        name: mapJSXNameOperands(attribute.name, next),
        value: mapAttributeValueOperands(attribute.value, next),
      };
  }
}

function mapAttributeValueOperands(
  value: JSXAttributeValue | null,
  next: (value: Value) => Value,
): JSXAttributeValue | null {
  if (value === null || value.kind === "string") return value;
  return { ...value, value: next(value.value) };
}

export function mapChildOperands(child: JSXChild, next: (value: Value) => Value): JSXChild {
  return child.kind === "text" ? child : { ...child, value: next(child.value) };
}
