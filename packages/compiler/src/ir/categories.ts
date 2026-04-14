/**
 * Category predicates for flat-IR op dispatch.
 *
 * Replaces the old intermediate subcategory base classes
 * (`ValueInstruction`, `MemoryInstruction`, `DeclarationInstruction`,
 * `JSXInstruction`, `ModuleInstruction`, `PatternInstruction`) which
 * existed purely as `instanceof` dispatch markers for the codegen.
 *
 * Under the flat IR, every concrete op extends {@link Operation}
 * directly. Codegen dispatch uses the predicates below instead of
 * climbing a hierarchy. Each predicate enumerates the concrete op
 * classes that belong to its category.
 *
 * Adding a new op means adding it to the appropriate predicate —
 * same boilerplate cost as creating a new empty subclass, but
 * without the class hierarchy.
 */
import { ClassDeclarationOp } from "./ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "./ops/func/FunctionDeclaration";
import { JSXAttributeOp } from "./ops/jsx/JSXAttribute";
import { JSXClosingElementOp } from "./ops/jsx/JSXClosingElement";
import { JSXClosingFragmentOp } from "./ops/jsx/JSXClosingFragment";
import { JSXElementOp } from "./ops/jsx/JSXElement";
import { JSXFragmentOp } from "./ops/jsx/JSXFragment";
import { JSXIdentifierOp } from "./ops/jsx/JSXIdentifier";
import { JSXMemberExpressionOp } from "./ops/jsx/JSXMemberExpression";
import { JSXNamespacedNameOp } from "./ops/jsx/JSXNamespacedName";
import { JSXOpeningElementOp } from "./ops/jsx/JSXOpeningElement";
import { JSXOpeningFragmentOp } from "./ops/jsx/JSXOpeningFragment";
import { JSXSpreadAttributeOp } from "./ops/jsx/JSXSpreadAttribute";
import { JSXTextOp } from "./ops/jsx/JSXText";
import { ArrayDestructureOp } from "./ops/pattern/ArrayDestructure";
import { LoadContextOp } from "./ops/mem/LoadContext";
import { LoadDynamicPropertyOp } from "./ops/prop/LoadDynamicProperty";
import { LoadGlobalOp } from "./ops/prop/LoadGlobal";
import { LoadLocalOp } from "./ops/mem/LoadLocal";
import { LoadStaticPropertyOp } from "./ops/prop/LoadStaticProperty";
import { ObjectDestructureOp } from "./ops/pattern/ObjectDestructure";
import { StoreContextOp } from "./ops/mem/StoreContext";
import { StoreDynamicPropertyOp } from "./ops/prop/StoreDynamicProperty";
import { StoreLocalOp } from "./ops/mem/StoreLocal";
import { StoreStaticPropertyOp } from "./ops/prop/StoreStaticProperty";
import { ExportAllOp } from "./ops/module/ExportAll";
import { ExportDeclarationOp } from "./ops/module/ExportDeclaration";
import { ExportDefaultDeclarationOp } from "./ops/module/ExportDefaultDeclaration";
import { ExportFromOp } from "./ops/module/ExportFrom";
import { ExportNamedDeclarationOp } from "./ops/module/ExportNamedDeclaration";
import { ExportSpecifierOp } from "./ops/module/ExportSpecifier";
import { ImportDeclarationOp } from "./ops/module/ImportDeclaration";
import { ImportSpecifierOp } from "./ops/module/ImportSpecifier";
import { AssignmentPatternOp } from "./ops/pattern/AssignmentPattern";
import { ArrayExpressionOp } from "./ops/object/ArrayExpression";
import { ArrowFunctionExpressionOp } from "./ops/func/ArrowFunctionExpression";
import { AwaitExpressionOp } from "./ops/call/AwaitExpression";
import { BinaryExpressionOp } from "./ops/arith/BinaryExpression";
import { CallExpressionOp } from "./ops/call/CallExpression";
import { ClassExpressionOp } from "./ops/class/ClassExpression";
import { ClassMethodOp } from "./ops/class/ClassMethod";
import { ClassPropertyOp } from "./ops/class/ClassProperty";
import { FunctionExpressionOp } from "./ops/func/FunctionExpression";
import { HoleOp } from "./ops/prim/Hole";
import { ImportExpressionOp } from "./ops/call/ImportExpression";
import { LiteralOp } from "./ops/prim/Literal";
import { LogicalExpressionOp } from "./ops/arith/LogicalExpression";
import { MetaPropertyOp } from "./ops/prop/MetaProperty";
import { NewExpressionOp } from "./ops/call/NewExpression";
import { ObjectExpressionOp } from "./ops/object/ObjectExpression";
import { ObjectMethodOp } from "./ops/object/ObjectMethod";
import { ObjectPropertyOp } from "./ops/object/ObjectProperty";
import { RegExpLiteralOp } from "./ops/prim/RegExpLiteral";
import { SequenceExpressionOp } from "./ops/arith/SequenceExpression";
import { SuperCallOp } from "./ops/call/SuperCall";
import { SuperPropertyOp } from "./ops/prop/SuperProperty";
import { TaggedTemplateExpressionOp } from "./ops/call/TaggedTemplateExpression";
import { TemplateLiteralOp } from "./ops/prim/TemplateLiteral";
import { ThisExpressionOp } from "./ops/prop/ThisExpression";
import { UnaryExpressionOp } from "./ops/arith/UnaryExpression";
import { YieldExpressionOp } from "./ops/call/YieldExpression";

// ---------------------------------------------------------------------
// Category unions — typed sets of concrete op classes. Codegen uses
// these for `instanceof`-based dispatch without needing an intermediate
// base class.
// ---------------------------------------------------------------------

export type ValueOp =
  | ArrayExpressionOp
  | ArrowFunctionExpressionOp
  | AwaitExpressionOp
  | BinaryExpressionOp
  | CallExpressionOp
  | ClassExpressionOp
  | ClassMethodOp
  | ClassPropertyOp
  | FunctionExpressionOp
  | HoleOp
  | ImportExpressionOp
  | LiteralOp
  | LogicalExpressionOp
  | MetaPropertyOp
  | NewExpressionOp
  | ObjectExpressionOp
  | ObjectMethodOp
  | ObjectPropertyOp
  | RegExpLiteralOp
  | SequenceExpressionOp
  | SuperCallOp
  | SuperPropertyOp
  | TaggedTemplateExpressionOp
  | TemplateLiteralOp
  | ThisExpressionOp
  | UnaryExpressionOp
  | YieldExpressionOp;

/**
 * NOTE: `DeclareLocalOp` is intentionally NOT in this union. It
 * extends `Operation` directly (not `MemoryInstruction`), and
 * the old codegen/pass dispatch preserved that distinction by
 * checking it BEFORE the memory check. Keeping it out of `MemoryOp`
 * preserves the dispatch order exactly.
 */
export type MemoryOp =
  | ArrayDestructureOp
  | LoadContextOp
  | LoadDynamicPropertyOp
  | LoadGlobalOp
  | LoadLocalOp
  | LoadStaticPropertyOp
  | ObjectDestructureOp
  | StoreContextOp
  | StoreDynamicPropertyOp
  | StoreLocalOp
  | StoreStaticPropertyOp;

export type DeclarationOp = ClassDeclarationOp | FunctionDeclarationOp;

export type JSXOp =
  | JSXAttributeOp
  | JSXClosingElementOp
  | JSXClosingFragmentOp
  | JSXElementOp
  | JSXFragmentOp
  | JSXIdentifierOp
  | JSXMemberExpressionOp
  | JSXNamespacedNameOp
  | JSXOpeningElementOp
  | JSXOpeningFragmentOp
  | JSXSpreadAttributeOp
  | JSXTextOp;

export type ModuleOp =
  | ExportAllOp
  | ExportDeclarationOp
  | ExportDefaultDeclarationOp
  | ExportFromOp
  | ExportNamedDeclarationOp
  | ExportSpecifierOp
  | ImportDeclarationOp
  | ImportSpecifierOp;

export type PatternOp = AssignmentPatternOp;

// ---------------------------------------------------------------------
// Runtime predicates — `isXxxOp(op): op is XxxOp`. Replace
// `instanceof XxxInstruction` in all pass / codegen code.
// ---------------------------------------------------------------------

const VALUE_CTORS = new Set<Function>([
  ArrayExpressionOp,
  ArrowFunctionExpressionOp,
  AwaitExpressionOp,
  BinaryExpressionOp,
  CallExpressionOp,
  ClassExpressionOp,
  ClassMethodOp,
  ClassPropertyOp,
  FunctionExpressionOp,
  HoleOp,
  ImportExpressionOp,
  LiteralOp,
  LogicalExpressionOp,
  MetaPropertyOp,
  NewExpressionOp,
  ObjectExpressionOp,
  ObjectMethodOp,
  ObjectPropertyOp,
  RegExpLiteralOp,
  SequenceExpressionOp,
  SuperCallOp,
  SuperPropertyOp,
  TaggedTemplateExpressionOp,
  TemplateLiteralOp,
  ThisExpressionOp,
  UnaryExpressionOp,
  YieldExpressionOp,
]);

const MEMORY_CTORS = new Set<Function>([
  ArrayDestructureOp,
  LoadContextOp,
  LoadDynamicPropertyOp,
  LoadGlobalOp,
  LoadLocalOp,
  LoadStaticPropertyOp,
  ObjectDestructureOp,
  StoreContextOp,
  StoreDynamicPropertyOp,
  StoreLocalOp,
  StoreStaticPropertyOp,
]);

const DECLARATION_CTORS = new Set<Function>([ClassDeclarationOp, FunctionDeclarationOp]);

const JSX_CTORS = new Set<Function>([
  JSXAttributeOp,
  JSXClosingElementOp,
  JSXClosingFragmentOp,
  JSXElementOp,
  JSXFragmentOp,
  JSXIdentifierOp,
  JSXMemberExpressionOp,
  JSXNamespacedNameOp,
  JSXOpeningElementOp,
  JSXOpeningFragmentOp,
  JSXSpreadAttributeOp,
  JSXTextOp,
]);

const MODULE_CTORS = new Set<Function>([
  ExportAllOp,
  ExportDeclarationOp,
  ExportDefaultDeclarationOp,
  ExportFromOp,
  ExportNamedDeclarationOp,
  ExportSpecifierOp,
  ImportDeclarationOp,
  ImportSpecifierOp,
]);

const PATTERN_CTORS = new Set<Function>([AssignmentPatternOp]);

/**
 * Walk an ancestor chain to see if `op`'s prototype chain contains any
 * of the given constructors. Equivalent to a disjunction of `instanceof`
 * checks against each member — kept as a Set walk to avoid enumerating
 * 27+ classes at every call site.
 */
function instanceOfAny(op: unknown, ctors: Set<Function>): boolean {
  if (op === null || typeof op !== "object") return false;
  let proto: object | null = Object.getPrototypeOf(op);
  while (proto !== null) {
    if (ctors.has(proto.constructor)) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

export function isValueOp(op: unknown): op is ValueOp {
  return instanceOfAny(op, VALUE_CTORS);
}

export function isMemoryOp(op: unknown): op is MemoryOp {
  return instanceOfAny(op, MEMORY_CTORS);
}

export function isDeclarationOp(op: unknown): op is DeclarationOp {
  return instanceOfAny(op, DECLARATION_CTORS);
}

export function isJSXOp(op: unknown): op is JSXOp {
  return instanceOfAny(op, JSX_CTORS);
}

export function isModuleOp(op: unknown): op is ModuleOp {
  return instanceOfAny(op, MODULE_CTORS);
}

export function isPatternOp(op: unknown): op is PatternOp {
  return instanceOfAny(op, PATTERN_CTORS);
}
