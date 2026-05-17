export type ProgramNode = {
  readonly type: "Program";
  readonly sourceType: ProgramSourceType;
  readonly body: StatementNode[];
};

export type StatementNode =
  | BlockStatementNode
  | BreakStatementNode
  | ClassDeclarationNode
  | ContinueStatementNode
  | DebuggerStatementNode
  | DoWhileStatementNode
  | ExpressionStatementNode
  | ForInStatementNode
  | ForOfStatementNode
  | ForStatementNode
  | FunctionDeclarationNode
  | IfStatementNode
  | ImportDeclarationNode
  | LabeledStatementNode
  | ExportAllDeclarationNode
  | ExportDefaultDeclarationNode
  | ExportNamedDeclarationNode
  | ReturnStatementNode
  | SwitchStatementNode
  | ThrowStatementNode
  | TryStatementNode
  | VariableDeclarationNode
  | WhileStatementNode;

export type ExpressionNode =
  | AssignmentExpressionNode
  | ArrayExpressionNode
  | AwaitExpressionNode
  | BinaryExpressionNode
  | CallExpressionNode
  | ClassExpressionNode
  | ConditionalExpressionNode
  | ArrowFunctionExpressionNode
  | FunctionExpressionNode
  | IdentifierNode
  | ImportExpressionNode
  | JSXElementNode
  | JSXFragmentNode
  | LiteralNode
  | LogicalExpressionNode
  | MemberExpressionNode
  | MetaPropertyNode
  | NewExpressionNode
  | ObjectExpressionNode
  | SequenceExpressionNode
  | SuperNode
  | TemplateLiteralNode
  | ThisExpressionNode
  | UnaryExpressionNode
  | YieldExpressionNode;

export type PropertyKeyNode = ExpressionNode | PrivateIdentifierNode;

export type PatternNode =
  | ArrayPatternNode
  | AssignmentPatternNode
  | IdentifierNode
  | MemberExpressionNode
  | ObjectPatternNode
  | RestElementNode;
export type ESTreeProgram = ProgramNode;
export type ESTreeStatement = StatementNode;
export type ESTreeExpression = ExpressionNode;
export type ESTreePattern = PatternNode;

export type ProgramSourceType = "module" | "script";
export type VariableDeclarationKind = "const" | "let" | "var";

export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "<<"
  | ">>"
  | ">>>"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "|"
  | "^"
  | "&"
  | "in"
  | "instanceof"
  | "**";

export type LogicalOperator = "&&" | "||" | "??";

export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

export type AssignmentOperator = "=";

export interface BaseNode {
  readonly type: string;
}

export interface Program extends BaseNode {
  readonly type: "Program";
  readonly sourceType: ProgramSourceType;
  readonly body: StatementNode[];
}

export interface BlockStatementNode extends BaseNode {
  readonly type: "BlockStatement";
  readonly body: StatementNode[];
}

export interface ExpressionStatementNode extends BaseNode {
  readonly type: "ExpressionStatement";
  readonly expression: ExpressionNode;
}

export interface DebuggerStatementNode extends BaseNode {
  readonly type: "DebuggerStatement";
}

export interface BreakStatementNode extends BaseNode {
  readonly type: "BreakStatement";
  readonly label: IdentifierNode | null;
}

export interface ContinueStatementNode extends BaseNode {
  readonly type: "ContinueStatement";
  readonly label: IdentifierNode | null;
}

export interface FunctionDeclarationNode extends BaseNode {
  readonly type: "FunctionDeclaration";
  readonly id: IdentifierNode;
  readonly params: PatternNode[];
  readonly body: BlockStatementNode;
  readonly async: boolean;
  readonly generator: boolean;
  readonly expression: false;
}

export type ImportDeclarationSpecifierNode =
  | ImportDefaultSpecifierNode
  | ImportNamespaceSpecifierNode
  | ImportSpecifierNode;

export interface ImportDeclarationNode extends BaseNode {
  readonly type: "ImportDeclaration";
  readonly specifiers: ImportDeclarationSpecifierNode[];
  readonly source: LiteralNode;
  readonly importKind: "value";
  readonly attributes: ImportAttributeNode[];
}

export interface ImportDefaultSpecifierNode extends BaseNode {
  readonly type: "ImportDefaultSpecifier";
  readonly local: IdentifierNode;
}

export interface ImportNamespaceSpecifierNode extends BaseNode {
  readonly type: "ImportNamespaceSpecifier";
  readonly local: IdentifierNode;
}

export interface ImportSpecifierNode extends BaseNode {
  readonly type: "ImportSpecifier";
  readonly imported: IdentifierNode | LiteralNode;
  readonly local: IdentifierNode;
  readonly importKind: "value";
}

export interface ExportNamedDeclarationNode extends BaseNode {
  readonly type: "ExportNamedDeclaration";
  readonly declaration: null;
  readonly specifiers: ExportSpecifierNode[];
  readonly source: LiteralNode | null;
  readonly exportKind: "value";
  readonly attributes: ImportAttributeNode[];
}

export interface ExportDefaultDeclarationNode extends BaseNode {
  readonly type: "ExportDefaultDeclaration";
  readonly declaration: ExpressionNode;
  readonly exportKind: "value";
}

export interface ExportSpecifierNode extends BaseNode {
  readonly type: "ExportSpecifier";
  readonly local: IdentifierNode | LiteralNode;
  readonly exported: IdentifierNode | LiteralNode;
  readonly exportKind: "value";
}

export interface ExportAllDeclarationNode extends BaseNode {
  readonly type: "ExportAllDeclaration";
  readonly exported: IdentifierNode | LiteralNode | null;
  readonly source: LiteralNode;
  readonly exportKind: "value";
  readonly attributes: ImportAttributeNode[];
}

export interface ImportAttributeNode extends BaseNode {
  readonly type: "ImportAttribute";
  readonly key: IdentifierNode | LiteralNode;
  readonly value: LiteralNode;
}

export interface IfStatementNode extends BaseNode {
  readonly type: "IfStatement";
  readonly test: ExpressionNode;
  readonly consequent: StatementNode;
  readonly alternate: StatementNode | null;
}

export interface LabeledStatementNode extends BaseNode {
  readonly type: "LabeledStatement";
  readonly label: IdentifierNode;
  readonly body: StatementNode;
}

export interface WhileStatementNode extends BaseNode {
  readonly type: "WhileStatement";
  readonly test: ExpressionNode;
  readonly body: StatementNode;
}

export interface DoWhileStatementNode extends BaseNode {
  readonly type: "DoWhileStatement";
  readonly body: StatementNode;
  readonly test: ExpressionNode;
}

export interface ForStatementNode extends BaseNode {
  readonly type: "ForStatement";
  readonly init: VariableDeclarationNode | ExpressionNode | null;
  readonly test: ExpressionNode | null;
  readonly update: ExpressionNode | null;
  readonly body: StatementNode;
}

export interface ForInStatementNode extends BaseNode {
  readonly type: "ForInStatement";
  readonly left: PatternNode | VariableDeclarationNode;
  readonly right: ExpressionNode;
  readonly body: StatementNode;
}

export interface ForOfStatementNode extends BaseNode {
  readonly type: "ForOfStatement";
  readonly await: boolean;
  readonly left: PatternNode | VariableDeclarationNode;
  readonly right: ExpressionNode;
  readonly body: StatementNode;
}

export interface ReturnStatementNode extends BaseNode {
  readonly type: "ReturnStatement";
  readonly argument: ExpressionNode | null;
}

export interface ThrowStatementNode extends BaseNode {
  readonly type: "ThrowStatement";
  readonly argument: ExpressionNode;
}

export interface SwitchStatementNode extends BaseNode {
  readonly type: "SwitchStatement";
  readonly discriminant: ExpressionNode;
  readonly cases: SwitchCaseNode[];
}

export interface SwitchCaseNode extends BaseNode {
  readonly type: "SwitchCase";
  readonly test: ExpressionNode | null;
  readonly consequent: StatementNode[];
}

export interface TryStatementNode extends BaseNode {
  readonly type: "TryStatement";
  readonly block: BlockStatementNode;
  readonly handler: CatchClauseNode | null;
  readonly finalizer: BlockStatementNode | null;
}

export interface CatchClauseNode extends BaseNode {
  readonly type: "CatchClause";
  readonly param: PatternNode | null;
  readonly body: BlockStatementNode;
}

export interface VariableDeclarationNode extends BaseNode {
  readonly type: "VariableDeclaration";
  readonly kind: VariableDeclarationKind;
  readonly declarations: VariableDeclaratorNode[];
}

export interface VariableDeclaratorNode extends BaseNode {
  readonly type: "VariableDeclarator";
  readonly id: PatternNode;
  readonly init: ExpressionNode | null;
}

export interface AssignmentExpressionNode extends BaseNode {
  readonly type: "AssignmentExpression";
  readonly operator: AssignmentOperator;
  readonly left: PatternNode | MemberExpressionNode;
  readonly right: ExpressionNode;
}

export interface BinaryExpressionNode extends BaseNode {
  readonly type: "BinaryExpression";
  readonly operator: BinaryOperator;
  readonly left: ExpressionNode | PrivateIdentifierNode;
  readonly right: ExpressionNode;
}

export interface ConditionalExpressionNode extends BaseNode {
  readonly type: "ConditionalExpression";
  readonly test: ExpressionNode;
  readonly consequent: ExpressionNode;
  readonly alternate: ExpressionNode;
}

export interface LogicalExpressionNode extends BaseNode {
  readonly type: "LogicalExpression";
  readonly operator: LogicalOperator;
  readonly left: ExpressionNode;
  readonly right: ExpressionNode;
}

export interface AwaitExpressionNode extends BaseNode {
  readonly type: "AwaitExpression";
  readonly argument: ExpressionNode;
}

export interface YieldExpressionNode extends BaseNode {
  readonly type: "YieldExpression";
  readonly argument: ExpressionNode | null;
  readonly delegate: boolean;
}

export interface CallExpressionNode extends BaseNode {
  readonly type: "CallExpression";
  readonly callee: ExpressionNode;
  readonly arguments: Array<ExpressionNode | SpreadElementNode>;
  readonly optional: false;
}

export interface ImportExpressionNode extends BaseNode {
  readonly type: "ImportExpression";
  readonly source: ExpressionNode;
  readonly options: ExpressionNode | null;
}

export interface NewExpressionNode extends BaseNode {
  readonly type: "NewExpression";
  readonly callee: ExpressionNode;
  readonly arguments: Array<ExpressionNode | SpreadElementNode>;
}

export interface ArrayExpressionNode extends BaseNode {
  readonly type: "ArrayExpression";
  readonly elements: Array<ExpressionNode | SpreadElementNode | null>;
}

export interface ObjectExpressionNode extends BaseNode {
  readonly type: "ObjectExpression";
  readonly properties: Array<ObjectExpressionPropertyNode | SpreadElementNode>;
}

export interface ObjectExpressionPropertyNode extends BaseNode {
  readonly type: "Property";
  readonly kind: "init" | "get" | "set";
  readonly key: ExpressionNode;
  readonly value: ExpressionNode;
  readonly method: boolean;
  readonly shorthand: boolean;
  readonly computed: boolean;
}

export interface SpreadElementNode extends BaseNode {
  readonly type: "SpreadElement";
  readonly argument: ExpressionNode;
}

export interface SequenceExpressionNode extends BaseNode {
  readonly type: "SequenceExpression";
  readonly expressions: ExpressionNode[];
}

export interface ThisExpressionNode extends BaseNode {
  readonly type: "ThisExpression";
}

export interface SuperNode extends BaseNode {
  readonly type: "Super";
}

export interface MetaPropertyNode extends BaseNode {
  readonly type: "MetaProperty";
  readonly meta: IdentifierNode;
  readonly property: IdentifierNode;
}

export interface FunctionExpressionNode extends BaseNode {
  readonly type: "FunctionExpression";
  readonly id: IdentifierNode | null;
  readonly params: PatternNode[];
  readonly body: BlockStatementNode;
  readonly async: boolean;
  readonly generator: boolean;
  readonly expression: false;
}

export interface ClassDeclarationNode extends BaseNode {
  readonly type: "ClassDeclaration";
  readonly id: IdentifierNode;
  readonly superClass: ExpressionNode | null;
  readonly body: ClassBodyNode;
}

export interface ClassExpressionNode extends BaseNode {
  readonly type: "ClassExpression";
  readonly id: IdentifierNode | null;
  readonly superClass: ExpressionNode | null;
  readonly body: ClassBodyNode;
}

export interface ClassBodyNode extends BaseNode {
  readonly type: "ClassBody";
  readonly body: ClassElementNode[];
}

export interface MethodDefinitionNode extends BaseNode {
  readonly type: "MethodDefinition";
  readonly kind: "constructor" | "method" | "get" | "set";
  readonly static: boolean;
  readonly computed: boolean;
  readonly key: PropertyKeyNode;
  readonly value: FunctionExpressionNode;
}

export interface PropertyDefinitionNode extends BaseNode {
  readonly type: "PropertyDefinition";
  readonly static: boolean;
  readonly computed: boolean;
  readonly key: PropertyKeyNode;
  readonly value: ExpressionNode | null;
}

export type ClassElementNode = MethodDefinitionNode | PropertyDefinitionNode;

export interface ArrowFunctionExpressionNode extends BaseNode {
  readonly type: "ArrowFunctionExpression";
  readonly params: PatternNode[];
  readonly body: BlockStatementNode;
  readonly async: boolean;
  readonly expression: false;
}

export interface IdentifierNode extends BaseNode {
  readonly type: "Identifier";
  readonly name: string;
}

export interface ArrayPatternNode extends BaseNode {
  readonly type: "ArrayPattern";
  readonly elements: Array<PatternNode | null>;
}

export interface AssignmentPatternNode extends BaseNode {
  readonly type: "AssignmentPattern";
  readonly left: PatternNode;
  readonly right: ExpressionNode;
}

export interface ObjectPatternNode extends BaseNode {
  readonly type: "ObjectPattern";
  readonly properties: Array<ObjectPatternPropertyNode | RestElementNode>;
}

export interface ObjectPatternPropertyNode extends BaseNode {
  readonly type: "Property";
  readonly kind: "init";
  readonly key: ExpressionNode;
  readonly value: PatternNode;
  readonly method: false;
  readonly shorthand: boolean;
  readonly computed: boolean;
}

export interface RestElementNode extends BaseNode {
  readonly type: "RestElement";
  readonly argument: PatternNode;
}

export interface LiteralNode extends BaseNode {
  readonly type: "Literal";
  readonly value: null | boolean | number | string | bigint | RegExp;
  readonly raw: string;
  readonly bigint?: string;
  readonly regex?: {
    readonly pattern: string;
    readonly flags: string;
  };
}

export interface MemberExpressionNode extends BaseNode {
  readonly type: "MemberExpression";
  readonly object: ExpressionNode;
  readonly property: PropertyKeyNode;
  readonly computed: boolean;
  readonly optional: false;
}

export interface PrivateIdentifierNode extends BaseNode {
  readonly type: "PrivateIdentifier";
  readonly name: string;
}

export type JSXNameNode = JSXIdentifierNode | JSXMemberExpressionNode | JSXNamespacedNameNode;

export type JSXMemberExpressionObjectNode = JSXIdentifierNode | JSXMemberExpressionNode;

export type JSXAttributeEntryNode = JSXAttributeNode | JSXSpreadAttributeNode;

export type JSXAttributeValueNode =
  | LiteralNode
  | JSXExpressionContainerNode
  | JSXElementNode
  | JSXFragmentNode;

export type JSXChildNode =
  | JSXTextNode
  | JSXExpressionContainerNode
  | JSXSpreadChildNode
  | JSXElementNode
  | JSXFragmentNode;

export interface JSXIdentifierNode extends BaseNode {
  readonly type: "JSXIdentifier";
  readonly name: string;
}

export interface JSXMemberExpressionNode extends BaseNode {
  readonly type: "JSXMemberExpression";
  readonly object: JSXMemberExpressionObjectNode;
  readonly property: JSXIdentifierNode;
}

export interface JSXNamespacedNameNode extends BaseNode {
  readonly type: "JSXNamespacedName";
  readonly namespace: JSXIdentifierNode;
  readonly name: JSXIdentifierNode;
}

export interface JSXAttributeNode extends BaseNode {
  readonly type: "JSXAttribute";
  readonly name: JSXIdentifierNode | JSXNamespacedNameNode;
  readonly value: JSXAttributeValueNode | null;
}

export interface JSXSpreadAttributeNode extends BaseNode {
  readonly type: "JSXSpreadAttribute";
  readonly argument: ExpressionNode;
}

export interface JSXExpressionContainerNode extends BaseNode {
  readonly type: "JSXExpressionContainer";
  readonly expression: ExpressionNode;
}

export interface JSXSpreadChildNode extends BaseNode {
  readonly type: "JSXSpreadChild";
  readonly expression: ExpressionNode;
}

export interface JSXTextNode extends BaseNode {
  readonly type: "JSXText";
  readonly value: string;
  readonly raw: string;
}

export interface JSXOpeningElementNode extends BaseNode {
  readonly type: "JSXOpeningElement";
  readonly name: JSXNameNode;
  readonly attributes: JSXAttributeEntryNode[];
  readonly selfClosing: boolean;
}

export interface JSXClosingElementNode extends BaseNode {
  readonly type: "JSXClosingElement";
  readonly name: JSXNameNode;
}

export interface JSXElementNode extends BaseNode {
  readonly type: "JSXElement";
  readonly openingElement: JSXOpeningElementNode;
  readonly closingElement: JSXClosingElementNode | null;
  readonly children: JSXChildNode[];
}

export interface JSXOpeningFragmentNode extends BaseNode {
  readonly type: "JSXOpeningFragment";
}

export interface JSXClosingFragmentNode extends BaseNode {
  readonly type: "JSXClosingFragment";
}

export interface JSXFragmentNode extends BaseNode {
  readonly type: "JSXFragment";
  readonly openingFragment: JSXOpeningFragmentNode;
  readonly closingFragment: JSXClosingFragmentNode;
  readonly children: JSXChildNode[];
}

export interface UnaryExpressionNode extends BaseNode {
  readonly type: "UnaryExpression";
  readonly operator: UnaryOperator;
  readonly prefix: true;
  readonly argument: ExpressionNode;
}

export interface TemplateLiteralNode extends BaseNode {
  readonly type: "TemplateLiteral";
  readonly quasis: TemplateElementNode[];
  readonly expressions: ExpressionNode[];
}

export interface TemplateElementNode extends BaseNode {
  readonly type: "TemplateElement";
  readonly value: {
    readonly raw: string;
    readonly cooked: string | null;
  };
  readonly tail: boolean;
}

export function program(
  body: StatementNode[],
  sourceType: ProgramSourceType = "module",
): ProgramNode {
  return {
    type: "Program",
    sourceType,
    body,
  };
}

export function blockStatement(body: StatementNode[]): BlockStatementNode {
  return {
    type: "BlockStatement",
    body,
  };
}

export function expressionStatement(expression: ExpressionNode): ExpressionStatementNode {
  return {
    type: "ExpressionStatement",
    expression,
  };
}

export function debuggerStatement(): DebuggerStatementNode {
  return {
    type: "DebuggerStatement",
  };
}

export function breakStatement(label: IdentifierNode | null = null): BreakStatementNode {
  return {
    type: "BreakStatement",
    label,
  };
}

export function continueStatement(label: IdentifierNode | null = null): ContinueStatementNode {
  return {
    type: "ContinueStatement",
    label,
  };
}

export function functionDeclaration(
  id: IdentifierNode,
  params: PatternNode[],
  body: StatementNode[],
  options: {
    readonly async?: boolean;
    readonly generator?: boolean;
  } = {},
): FunctionDeclarationNode {
  return {
    type: "FunctionDeclaration",
    id,
    params,
    body: blockStatement(body),
    async: options.async ?? false,
    generator: options.generator ?? false,
    expression: false,
  };
}

export function importDeclaration(
  specifiers: ImportDeclarationSpecifierNode[],
  source: string,
  attributes: ImportAttributeNode[] = [],
): ImportDeclarationNode {
  return {
    type: "ImportDeclaration",
    specifiers,
    source: literal(source),
    importKind: "value",
    attributes,
  };
}

export function importDefaultSpecifier(local: IdentifierNode): ImportDefaultSpecifierNode {
  return {
    type: "ImportDefaultSpecifier",
    local,
  };
}

export function importNamespaceSpecifier(local: IdentifierNode): ImportNamespaceSpecifierNode {
  return {
    type: "ImportNamespaceSpecifier",
    local,
  };
}

export function importSpecifier(
  imported: IdentifierNode | LiteralNode,
  local: IdentifierNode,
): ImportSpecifierNode {
  return {
    type: "ImportSpecifier",
    imported,
    local,
    importKind: "value",
  };
}

export function exportNamedDeclaration(
  specifiers: ExportSpecifierNode[],
  source: string | null = null,
  attributes: ImportAttributeNode[] = [],
): ExportNamedDeclarationNode {
  return {
    type: "ExportNamedDeclaration",
    declaration: null,
    specifiers,
    source: source === null ? null : literal(source),
    exportKind: "value",
    attributes,
  };
}

export function exportDefaultDeclaration(
  declaration: ExpressionNode,
): ExportDefaultDeclarationNode {
  return {
    type: "ExportDefaultDeclaration",
    declaration,
    exportKind: "value",
  };
}

export function exportSpecifier(
  local: IdentifierNode | LiteralNode,
  exported: IdentifierNode | LiteralNode,
): ExportSpecifierNode {
  return {
    type: "ExportSpecifier",
    local,
    exported,
    exportKind: "value",
  };
}

export function exportAllDeclaration(
  source: string,
  exported: IdentifierNode | LiteralNode | null = null,
  attributes: ImportAttributeNode[] = [],
): ExportAllDeclarationNode {
  return {
    type: "ExportAllDeclaration",
    exported,
    source: literal(source),
    exportKind: "value",
    attributes,
  };
}

export function importAttribute(
  key: IdentifierNode | LiteralNode,
  value: string,
): ImportAttributeNode {
  return {
    type: "ImportAttribute",
    key,
    value: literal(value),
  };
}

export function functionExpression(
  params: PatternNode[],
  body: StatementNode[],
  options: {
    readonly id?: IdentifierNode | null;
    readonly async?: boolean;
    readonly generator?: boolean;
  } = {},
): FunctionExpressionNode {
  return {
    type: "FunctionExpression",
    id: options.id ?? null,
    params,
    body: blockStatement(body),
    async: options.async ?? false,
    generator: options.generator ?? false,
    expression: false,
  };
}

export function classDeclaration(
  id: IdentifierNode,
  superClass: ExpressionNode | null,
  elements: ClassElementNode[],
): ClassDeclarationNode {
  return {
    type: "ClassDeclaration",
    id,
    superClass,
    body: classBody(elements),
  };
}

export function classExpression(
  id: IdentifierNode | null,
  superClass: ExpressionNode | null,
  elements: ClassElementNode[],
): ClassExpressionNode {
  return {
    type: "ClassExpression",
    id,
    superClass,
    body: classBody(elements),
  };
}

export function classBody(elements: ClassElementNode[]): ClassBodyNode {
  return {
    type: "ClassBody",
    body: elements,
  };
}

export function methodDefinition(
  kind: "constructor" | "method" | "get" | "set",
  key: PropertyKeyNode,
  value: FunctionExpressionNode,
  options: {
    readonly static?: boolean;
    readonly computed?: boolean;
  } = {},
): MethodDefinitionNode {
  return {
    type: "MethodDefinition",
    kind,
    static: options.static ?? false,
    computed: options.computed ?? false,
    key,
    value,
  };
}

export function propertyDefinition(
  key: PropertyKeyNode,
  value: ExpressionNode | null,
  options: {
    readonly static?: boolean;
    readonly computed?: boolean;
  } = {},
): PropertyDefinitionNode {
  return {
    type: "PropertyDefinition",
    static: options.static ?? false,
    computed: options.computed ?? false,
    key,
    value,
  };
}

export function ifStatement(
  test: ExpressionNode,
  consequent: StatementNode,
  alternate: StatementNode | null = null,
): IfStatementNode {
  return {
    type: "IfStatement",
    test,
    consequent,
    alternate,
  };
}

export function labeledStatement(label: IdentifierNode, body: StatementNode): LabeledStatementNode {
  return {
    type: "LabeledStatement",
    label,
    body,
  };
}

export function whileStatement(test: ExpressionNode, body: StatementNode): WhileStatementNode {
  return {
    type: "WhileStatement",
    test,
    body,
  };
}

export function doWhileStatement(body: StatementNode, test: ExpressionNode): DoWhileStatementNode {
  return {
    type: "DoWhileStatement",
    body,
    test,
  };
}

export function forStatement(
  init: VariableDeclarationNode | ExpressionNode | null,
  test: ExpressionNode | null,
  update: ExpressionNode | null,
  body: StatementNode,
): ForStatementNode {
  return {
    type: "ForStatement",
    init,
    test,
    update,
    body,
  };
}

export function forInStatement(
  left: PatternNode | VariableDeclarationNode,
  right: ExpressionNode,
  body: StatementNode,
): ForInStatementNode {
  return {
    type: "ForInStatement",
    left,
    right,
    body,
  };
}

export function forOfStatement(
  left: PatternNode | VariableDeclarationNode,
  right: ExpressionNode,
  body: StatementNode,
  isAwait = false,
): ForOfStatementNode {
  return {
    type: "ForOfStatement",
    await: isAwait,
    left,
    right,
    body,
  };
}

export function arrowFunctionExpression(
  params: PatternNode[],
  body: StatementNode[],
  options: {
    readonly async?: boolean;
  } = {},
): ArrowFunctionExpressionNode {
  return {
    type: "ArrowFunctionExpression",
    params,
    body: blockStatement(body),
    async: options.async ?? false,
    expression: false,
  };
}

export function returnStatement(argument: ExpressionNode | null): ReturnStatementNode {
  return {
    type: "ReturnStatement",
    argument,
  };
}

export function throwStatement(argument: ExpressionNode): ThrowStatementNode {
  return {
    type: "ThrowStatement",
    argument,
  };
}

export function switchStatement(
  discriminant: ExpressionNode,
  cases: SwitchCaseNode[],
): SwitchStatementNode {
  return {
    type: "SwitchStatement",
    discriminant,
    cases,
  };
}

export function switchCase(
  test: ExpressionNode | null,
  consequent: StatementNode[],
): SwitchCaseNode {
  return {
    type: "SwitchCase",
    test,
    consequent,
  };
}

export function tryStatement(
  body: StatementNode[],
  handler: CatchClauseNode | null,
  finalizer: StatementNode[] | null,
): TryStatementNode {
  return {
    type: "TryStatement",
    block: blockStatement(body),
    handler,
    finalizer: finalizer === null ? null : blockStatement(finalizer),
  };
}

export function catchClause(param: PatternNode | null, body: StatementNode[]): CatchClauseNode {
  return {
    type: "CatchClause",
    param,
    body: blockStatement(body),
  };
}

export function identifier(name: string): IdentifierNode {
  return {
    type: "Identifier",
    name,
  };
}

export function arrayPattern(elements: Array<PatternNode | null>): ArrayPatternNode {
  return {
    type: "ArrayPattern",
    elements,
  };
}

export function assignmentPattern(left: PatternNode, right: ExpressionNode): AssignmentPatternNode {
  return {
    type: "AssignmentPattern",
    left,
    right,
  };
}

export function objectPattern(
  properties: Array<ObjectPatternPropertyNode | RestElementNode>,
): ObjectPatternNode {
  return {
    type: "ObjectPattern",
    properties,
  };
}

export function objectPatternProperty(
  key: ExpressionNode,
  value: PatternNode,
  computed: boolean,
  shorthand = false,
): ObjectPatternPropertyNode {
  return {
    type: "Property",
    kind: "init",
    key,
    value,
    method: false,
    shorthand,
    computed,
  };
}

export function restElement(argument: PatternNode): RestElementNode {
  return {
    type: "RestElement",
    argument,
  };
}

export function literal(value: null | boolean | number | string | bigint): LiteralNode;
export function literal(value: undefined): IdentifierNode;
export function literal(
  value: null | undefined | boolean | number | string | bigint,
): LiteralNode | IdentifierNode;
export function literal(
  value: null | undefined | boolean | number | string | bigint,
): LiteralNode | IdentifierNode {
  if (value === undefined) {
    return identifier("undefined");
  }

  if (typeof value === "bigint") {
    return {
      type: "Literal",
      value,
      bigint: value.toString(),
      raw: `${value}n`,
    };
  }

  return {
    type: "Literal",
    value,
    raw: JSON.stringify(value),
  };
}

export function regExpLiteral(pattern: string, flags: string): LiteralNode {
  return {
    type: "Literal",
    value: new RegExp(pattern, flags),
    raw: `/${pattern}/${flags}`,
    regex: {
      pattern,
      flags,
    },
  };
}

export function variableDeclaration(
  kind: VariableDeclarationKind,
  id: PatternNode,
  init: ExpressionNode | null,
): VariableDeclarationNode {
  return {
    type: "VariableDeclaration",
    kind,
    declarations: [
      {
        type: "VariableDeclarator",
        id,
        init,
      },
    ],
  };
}

export function assignmentExpression(
  left: PatternNode | MemberExpressionNode,
  right: ExpressionNode,
): AssignmentExpressionNode {
  return {
    type: "AssignmentExpression",
    operator: "=",
    left,
    right,
  };
}

export function binaryExpression(
  operator: BinaryOperator,
  left: ExpressionNode | PrivateIdentifierNode,
  right: ExpressionNode,
): BinaryExpressionNode {
  return {
    type: "BinaryExpression",
    operator,
    left,
    right,
  };
}

export function callExpression(
  callee: ExpressionNode,
  args: Array<ExpressionNode | SpreadElementNode>,
): CallExpressionNode {
  return {
    type: "CallExpression",
    callee,
    arguments: args,
    optional: false,
  };
}

export function importExpression(
  source: ExpressionNode,
  options: ExpressionNode | null = null,
): ImportExpressionNode {
  return {
    type: "ImportExpression",
    source,
    options,
  };
}

export function newExpression(
  callee: ExpressionNode,
  args: Array<ExpressionNode | SpreadElementNode>,
): NewExpressionNode {
  return {
    type: "NewExpression",
    callee,
    arguments: args,
  };
}

export function arrayExpression(
  elements: Array<ExpressionNode | SpreadElementNode | null>,
): ArrayExpressionNode {
  return {
    type: "ArrayExpression",
    elements,
  };
}

export function objectExpression(
  properties: Array<ObjectExpressionPropertyNode | SpreadElementNode>,
): ObjectExpressionNode {
  return {
    type: "ObjectExpression",
    properties,
  };
}

export function objectExpressionProperty(
  key: ExpressionNode,
  value: ExpressionNode,
  computed: boolean,
  shorthand = false,
  kind: "init" | "get" | "set" = "init",
  method = false,
): ObjectExpressionPropertyNode {
  return {
    type: "Property",
    kind,
    key,
    value,
    method,
    shorthand,
    computed,
  };
}

export function spreadElement(argument: ExpressionNode): SpreadElementNode {
  return {
    type: "SpreadElement",
    argument,
  };
}

export function sequenceExpression(expressions: ExpressionNode[]): SequenceExpressionNode {
  return {
    type: "SequenceExpression",
    expressions,
  };
}

export function conditionalExpression(
  test: ExpressionNode,
  consequent: ExpressionNode,
  alternate: ExpressionNode,
): ConditionalExpressionNode {
  return {
    type: "ConditionalExpression",
    test,
    consequent,
    alternate,
  };
}

export function logicalExpression(
  operator: LogicalOperator,
  left: ExpressionNode,
  right: ExpressionNode,
): LogicalExpressionNode {
  return {
    type: "LogicalExpression",
    operator,
    left,
    right,
  };
}

export function thisExpression(): ThisExpressionNode {
  return {
    type: "ThisExpression",
  };
}

export function superExpression(): SuperNode {
  return {
    type: "Super",
  };
}

export function metaProperty(meta: IdentifierNode, property: IdentifierNode): MetaPropertyNode {
  return {
    type: "MetaProperty",
    meta,
    property,
  };
}

export function awaitExpression(argument: ExpressionNode): AwaitExpressionNode {
  return {
    type: "AwaitExpression",
    argument,
  };
}

export function yieldExpression(
  argument: ExpressionNode | null,
  delegate: boolean,
): YieldExpressionNode {
  return {
    type: "YieldExpression",
    argument,
    delegate,
  };
}

export function templateElement(
  raw: string,
  cooked: string | null,
  tail: boolean,
): TemplateElementNode {
  return {
    type: "TemplateElement",
    value: { raw, cooked },
    tail,
  };
}

export function templateLiteral(
  quasis: TemplateElementNode[],
  expressions: ExpressionNode[],
): TemplateLiteralNode {
  return {
    type: "TemplateLiteral",
    quasis,
    expressions,
  };
}

export function unaryExpression(
  operator: UnaryOperator,
  argument: ExpressionNode,
): UnaryExpressionNode {
  return {
    type: "UnaryExpression",
    operator,
    prefix: true,
    argument,
  };
}

export function memberExpression(
  object: ExpressionNode,
  property: PropertyKeyNode,
  computed: boolean,
): MemberExpressionNode {
  return {
    type: "MemberExpression",
    object,
    property,
    computed,
    optional: false,
  };
}

export function privateIdentifier(name: string): PrivateIdentifierNode {
  return {
    type: "PrivateIdentifier",
    name,
  };
}

export function jsxIdentifier(name: string): JSXIdentifierNode {
  return {
    type: "JSXIdentifier",
    name,
  };
}

export function jsxMemberExpression(
  object: JSXMemberExpressionObjectNode,
  property: JSXIdentifierNode,
): JSXMemberExpressionNode {
  return {
    type: "JSXMemberExpression",
    object,
    property,
  };
}

export function jsxNamespacedName(
  namespace: JSXIdentifierNode,
  name: JSXIdentifierNode,
): JSXNamespacedNameNode {
  return {
    type: "JSXNamespacedName",
    namespace,
    name,
  };
}

export function jsxAttribute(
  name: JSXIdentifierNode | JSXNamespacedNameNode,
  value: JSXAttributeValueNode | null,
): JSXAttributeNode {
  return {
    type: "JSXAttribute",
    name,
    value,
  };
}

export function jsxSpreadAttribute(argument: ExpressionNode): JSXSpreadAttributeNode {
  return {
    type: "JSXSpreadAttribute",
    argument,
  };
}

export function jsxExpressionContainer(expression: ExpressionNode): JSXExpressionContainerNode {
  return {
    type: "JSXExpressionContainer",
    expression,
  };
}

export function jsxSpreadChild(expression: ExpressionNode): JSXSpreadChildNode {
  return {
    type: "JSXSpreadChild",
    expression,
  };
}

export function jsxText(value: string): JSXTextNode {
  return {
    type: "JSXText",
    value,
    raw: value,
  };
}

export function jsxOpeningElement(
  name: JSXNameNode,
  attributes: JSXAttributeEntryNode[],
  selfClosing: boolean,
): JSXOpeningElementNode {
  return {
    type: "JSXOpeningElement",
    name,
    attributes,
    selfClosing,
  };
}

export function jsxClosingElement(name: JSXNameNode): JSXClosingElementNode {
  return {
    type: "JSXClosingElement",
    name,
  };
}

export function jsxElement(
  name: JSXNameNode,
  attributes: JSXAttributeEntryNode[],
  children: JSXChildNode[],
): JSXElementNode {
  const selfClosing = children.length === 0;

  return {
    type: "JSXElement",
    openingElement: jsxOpeningElement(name, attributes, selfClosing),
    closingElement: selfClosing ? null : jsxClosingElement(name),
    children,
  };
}

export function jsxOpeningFragment(): JSXOpeningFragmentNode {
  return {
    type: "JSXOpeningFragment",
  };
}

export function jsxClosingFragment(): JSXClosingFragmentNode {
  return {
    type: "JSXClosingFragment",
  };
}

export function jsxFragment(children: JSXChildNode[]): JSXFragmentNode {
  return {
    type: "JSXFragment",
    openingFragment: jsxOpeningFragment(),
    closingFragment: jsxClosingFragment(),
    children,
  };
}
