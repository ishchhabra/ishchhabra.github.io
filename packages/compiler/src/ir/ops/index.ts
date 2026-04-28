/**
 * Barrel re-exporting every concrete op class organized by semantic
 * domain. Each subdirectory groups ops that share a semantic
 * category:
 *
 *   prim/    — universal primitives: Literal, RegExpLiteral,
 *              TemplateLiteral, Hole, Debugger, SpreadElement
 *   arith/   — BinaryExpression, UnaryExpression, LogicalExpression,
 *              SequenceExpression
 *   call/    — Call, New, SuperCall, TaggedTemplate, Import, Await, Yield
 *   func/    — FunctionExpression, ArrowFunctionExpression,
 *              FunctionDeclaration
 *   class/   — Class expression/declaration, ClassMethod, ClassProperty
 *   object/  — ArrayExpression, ObjectExpression, ObjectProperty,
 *              ObjectMethod
 *   pattern/ — ArrayDestructure, ObjectDestructure, AssignmentPattern
 *   prop/    — LoadGlobal, LoadStatic/DynamicProperty, StoreStatic/
 *              DynamicProperty, MetaProperty, ThisExpression,
 *              SuperProperty
 *   mem/     — BindingDecl, LoadLocal, StoreLocal, LoadContext,
 *              StoreContext
 *   module/  — Import / Export declarations and specifiers
 *   jsx/     — JSX elements, fragments, attributes, text
 *   control/ — Terminators (Jump, Branch, Return, Throw, Break,
 *              Continue, Yield, Switch, Try) and structured control
 *              flow (If, While, Block, ForIn, ForOf, LabeledBlock).
 *              See `./control/index.ts` for the Structure union and
 *              isStructure predicate. Terminators are recognised via
 *              `instanceof TermOp` (see `../core/Operation.ts`).
 */

// prim
export { LiteralOp, type TPrimitiveValue } from "./prim/Literal";
export { RegExpLiteralOp } from "./prim/RegExpLiteral";
export { TemplateLiteralOp, type TemplateElement } from "./prim/TemplateLiteral";
export { HoleOp } from "./prim/Hole";
export { DebuggerStatementOp } from "./prim/Debugger";
export { SpreadElementOp } from "./prim/SpreadElement";

// control — CFG terminators
export {
  BranchTermOp,
  ForInTermOp,
  ForOfTermOp,
  ForTermOp,
  IfTermOp,
  JumpTermOp,
  LabeledTermOp,
  ReturnTermOp,
  type SwitchCase,
  SwitchTermOp,
  ThrowTermOp,
  TryTermOp,
  WhileTermOp,
} from "./control";

// arith
export {
  AssignmentExpressionOp,
  type AssignmentOperator,
  type AssignmentTarget,
} from "./arith/AssignmentExpression";
export { BinaryExpressionOp, type BinaryOperator } from "./arith/BinaryExpression";
export { ConditionalExpressionOp } from "./arith/ConditionalExpression";
export { LogicalExpressionOp, type LogicalOperator } from "./arith/LogicalExpression";
export { UnaryExpressionOp, type UnaryOperator } from "./arith/UnaryExpression";
export { SequenceExpressionOp } from "./arith/SequenceExpression";

// call
export { CallExpressionOp } from "./call/CallExpression";
export { NewExpressionOp } from "./call/NewExpression";
export { SuperCallOp } from "./call/SuperCall";
export { TaggedTemplateExpressionOp } from "./call/TaggedTemplateExpression";
export { ImportExpressionOp } from "./call/ImportExpression";
export { AwaitExpressionOp } from "./call/AwaitExpression";
export { YieldExpressionOp } from "./call/YieldExpression";

// func
export { FunctionExpressionOp } from "./func/FunctionExpression";
export { ArrowFunctionExpressionOp } from "./func/ArrowFunctionExpression";
export { FunctionDeclarationOp } from "./func/FunctionDeclaration";

// class
export { ClassExpressionOp } from "./class/ClassExpression";
export { ClassMethodOp } from "./class/ClassMethod";
export { ClassPropertyOp } from "./class/ClassProperty";
export { ClassDeclarationOp } from "./class/ClassDeclaration";

// object
export { ArrayExpressionOp } from "./object/ArrayExpression";
export { ObjectExpressionOp } from "./object/ObjectExpression";
export { ObjectPropertyOp } from "./object/ObjectProperty";
export { ObjectMethodOp } from "./object/ObjectMethod";

// pattern
export { ArrayDestructureOp } from "./pattern/ArrayDestructure";
export { ObjectDestructureOp } from "./pattern/ObjectDestructure";
export { AssignmentPatternOp } from "./pattern/AssignmentPattern";

// prop
export { MetaPropertyOp } from "./prop/MetaProperty";
export { ThisExpressionOp } from "./prop/ThisExpression";
export { SuperPropertyOp } from "./prop/SuperProperty";
export { LoadGlobalOp } from "./prop/LoadGlobal";
export { LoadStaticPropertyOp } from "./prop/LoadStaticProperty";
export { LoadDynamicPropertyOp } from "./prop/LoadDynamicProperty";
export { StoreStaticPropertyOp } from "./prop/StoreStaticProperty";
export { StoreDynamicPropertyOp } from "./prop/StoreDynamicProperty";

// mem
export {
  BindingDeclOp,
  BindingInitOp,
  type BindingDeclKind,
  type BindingKind,
} from "./mem/BindingDecl";
export { LoadLocalOp } from "./mem/LoadLocal";
export { StoreLocalOp } from "./mem/StoreLocal";
export { LoadContextOp } from "./mem/LoadContext";
export { StoreContextOp, type StoreContextKind } from "./mem/StoreContext";

// module
export { ImportDeclarationOp } from "./module/ImportDeclaration";
export { ImportSpecifierOp } from "./module/ImportSpecifier";
export { ExportAllOp } from "./module/ExportAll";
export { ExportDeclarationOp } from "./module/ExportDeclaration";
export { ExportDefaultDeclarationOp } from "./module/ExportDefaultDeclaration";
export { ExportFromOp, type ExportFromSpecifier } from "./module/ExportFrom";
export { ExportNamedDeclarationOp } from "./module/ExportNamedDeclaration";
export { ExportSpecifierOp } from "./module/ExportSpecifier";

// jsx
export { JSXElementOp } from "./jsx/JSXElement";
export { JSXFragmentOp } from "./jsx/JSXFragment";
export { JSXAttributeOp } from "./jsx/JSXAttribute";
export { JSXSpreadAttributeOp } from "./jsx/JSXSpreadAttribute";
export { JSXOpeningElementOp } from "./jsx/JSXOpeningElement";
export { JSXClosingElementOp } from "./jsx/JSXClosingElement";
export { JSXOpeningFragmentOp } from "./jsx/JSXOpeningFragment";
export { JSXClosingFragmentOp } from "./jsx/JSXClosingFragment";
export { JSXIdentifierOp } from "./jsx/JSXIdentifier";
export { JSXMemberExpressionOp } from "./jsx/JSXMemberExpression";
export { JSXNamespacedNameOp } from "./jsx/JSXNamespacedName";
export { JSXTextOp } from "./jsx/JSXText";
