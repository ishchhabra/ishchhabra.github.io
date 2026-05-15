import type {
  BindingIdentifier,
  BindingPattern,
  BindingRestElement,
  AssignmentTarget,
  AssignmentTargetMaybeDefault,
  AssignmentTargetRest,
  Argument,
  ArrowFunctionExpression,
  Class,
  Expression,
  Function,
  ImportDeclaration as OxcImportDeclaration,
  ParamPattern,
  Program,
  PropertyKey,
  Statement,
  CatchClause,
  VariableDeclaration,
  ClassElement as OxcClassElement,
  JSXAttributeItem,
  JSXChild,
} from "oxc-parser";

import type { ScopeAnalysisContext } from "./analyzeScopes";
import type { Declaration } from "./Declaration";
import { DeclarationInstantiationPlan } from "./DeclarationInstantiationPlan";
import { Scope } from "./Scope";
import { ScopeGraph } from "./ScopeGraph";

type DeclarationInput =
  | Omit<Extract<Declaration, { kind: "var" }>, "id">
  | Omit<Extract<Declaration, { kind: "lexical" }>, "id">
  | Omit<Extract<Declaration, { kind: "function" }>, "id">
  | Omit<Extract<Declaration, { kind: "parameter" }>, "id">
  | Omit<Extract<Declaration, { kind: "import" }>, "id">
  | Omit<Extract<Declaration, { kind: "catch-parameter" }>, "id">;

/**
 * Creates scopes and registers declarations before reference resolution.
 */
export class DeclarationCollector {
  public readonly graph: ScopeGraph;
  public readonly instantiation = new DeclarationInstantiationPlan();

  constructor(private readonly context: ScopeAnalysisContext) {
    const programScope = new Scope("module", null);
    this.graph = new ScopeGraph(programScope);
  }

  public collectProgram(program: Program): void {
    this.graph.setScope(program, this.graph.programScope);

    for (const statement of program.body) {
      this.collectStatement(statement, this.graph.programScope);
    }
  }

  private collectStatement(statement: Statement, scope: Scope): void {
    switch (statement.type) {
      case "EmptyStatement":
      case "DebuggerStatement":
        return;

      case "ExpressionStatement":
        return this.collectExpression(statement.expression, scope);

      case "ReturnStatement":
        if (statement.argument !== null) {
          this.collectExpression(statement.argument, scope);
        }
        return;

      case "ThrowStatement":
        this.collectExpression(statement.argument, scope);
        return;

      case "BreakStatement":
      case "ContinueStatement":
        return;

      case "LabeledStatement":
        this.collectStatement(statement.body, scope);
        return;

      case "IfStatement":
        this.collectExpression(statement.test, scope);
        this.collectStatement(statement.consequent, scope);
        if (statement.alternate !== null) {
          this.collectStatement(statement.alternate, scope);
        }
        return;

      case "WhileStatement":
        this.collectExpression(statement.test, scope);
        this.collectStatement(statement.body, scope);
        return;

      case "DoWhileStatement":
        this.collectStatement(statement.body, scope);
        this.collectExpression(statement.test, scope);
        return;

      case "ForStatement": {
        const loopScope = new Scope("block", scope);
        this.graph.setScope(statement, loopScope);

        if (statement.init !== null) {
          if (statement.init.type === "VariableDeclaration") {
            this.collectVariableDeclaration(statement.init, loopScope);
          } else {
            this.collectExpression(statement.init, loopScope);
          }
        }
        if (statement.test !== null) {
          this.collectExpression(statement.test, loopScope);
        }
        if (statement.update !== null) {
          this.collectExpression(statement.update, loopScope);
        }
        this.collectStatement(statement.body, loopScope);
        return;
      }

      case "SwitchStatement": {
        this.collectExpression(statement.discriminant, scope);

        const switchScope = new Scope("block", scope);
        this.graph.setScope(statement, switchScope);

        for (const switchCase of statement.cases) {
          if (switchCase.test !== null) {
            this.collectExpression(switchCase.test, switchScope);
          }

          for (const consequent of switchCase.consequent) {
            this.collectStatement(consequent, switchScope);
          }
        }

        return;
      }

      case "TryStatement":
        this.collectStatement(statement.block, scope);
        if (statement.handler !== null) {
          this.collectCatchClause(statement.handler, scope);
        }
        if (statement.finalizer !== null) {
          this.collectStatement(statement.finalizer, scope);
        }
        return;

      case "ForInStatement": {
        this.collectExpression(statement.right, scope);

        const loopScope = new Scope("block", scope);
        this.graph.setScope(statement, loopScope);

        if (statement.left.type === "VariableDeclaration") {
          this.collectVariableDeclaration(statement.left, loopScope);
        }

        this.collectStatement(statement.body, loopScope);
        return;
      }

      case "ForOfStatement": {
        this.collectExpression(statement.right, scope);

        const loopScope = new Scope("block", scope);
        this.graph.setScope(statement, loopScope);

        if (statement.left.type === "VariableDeclaration") {
          this.collectVariableDeclaration(statement.left, loopScope);
        }

        this.collectStatement(statement.body, loopScope);
        return;
      }

      case "BlockStatement":
        const blockScope = new Scope("block", scope);
        this.graph.setScope(statement, blockScope);

        for (const child of statement.body) {
          this.collectStatement(child, blockScope);
        }

        return;

      case "VariableDeclaration":
        return this.collectVariableDeclaration(statement, scope);

      case "TSTypeAliasDeclaration":
      case "TSInterfaceDeclaration":
        return;

      case "TSEnumDeclaration":
        if (statement.declare) return;
        throw new Error("Runtime TypeScript enums require enum lowering");

      case "TSImportEqualsDeclaration":
        if (statement.importKind === "type") return;
        throw new Error("Runtime TypeScript import-equals declarations require lowering");

      case "TSModuleDeclaration":
        if (statement.declare) return;
        throw new Error("Runtime TypeScript namespaces require namespace lowering");

      case "FunctionDeclaration":
        return this.collectFunctionDeclaration(statement, scope);

      case "ClassDeclaration":
        return this.collectClassDeclaration(statement, scope);

      case "ImportDeclaration":
        return this.collectImportDeclaration(statement, scope);

      case "ExportNamedDeclaration":
        if (statement.declaration !== null) {
          return this.collectStatement(statement.declaration, scope);
        }

        return;

      case "ExportDefaultDeclaration":
        if (statement.declaration.type === "FunctionDeclaration") {
          return statement.declaration.id === null
            ? this.collectFunctionScope(statement.declaration, scope)
            : this.collectStatement(statement.declaration, scope);
        }

        if (statement.declaration.type === "ClassDeclaration") {
          return statement.declaration.id === null
            ? this.collectClassExpression(statement.declaration, scope)
            : this.collectStatement(statement.declaration, scope);
        }

        if (statement.declaration.type === "TSInterfaceDeclaration") {
          throw new Error("Type-only default exports are not supported");
        }

        return this.collectExpression(statement.declaration, scope);

      case "ExportAllDeclaration":
        return;

      default:
        throw new Error(`Unsupported statement type: ${statement.type}`);
    }
  }

  private collectVariableDeclaration(declaration: VariableDeclaration, scope: Scope): void {
    for (const declarator of declaration.declarations) {
      for (const binding of bindingIdentifiers(declarator.id)) {
        if (declaration.kind === "var") {
          const target = nearestVarScope(scope);
          const sourceDeclaration = this.createDeclaration({
            kind: "var",
            name: binding.name,
          });
          target.add(sourceDeclaration);
          this.graph.bindDeclaration(binding, sourceDeclaration);
          this.context.declarations.add(sourceDeclaration);
          this.instantiation.addVar(target, sourceDeclaration);
          continue;
        }

        if (declaration.kind !== "let" && declaration.kind !== "const") {
          throw new Error(`Unsupported lexical declaration kind: ${declaration.kind}`);
        }

        const sourceDeclaration = this.createDeclaration({
          kind: "lexical",
          mode: declaration.kind,
          name: binding.name,
        });
        scope.add(sourceDeclaration);
        this.graph.bindDeclaration(binding, sourceDeclaration);
        this.context.declarations.add(sourceDeclaration);
        this.instantiation.addLexical(scope, sourceDeclaration);
      }

      if (declarator.init !== null) {
        this.collectExpression(declarator.init, scope);
      }
    }
  }

  private collectCatchClause(clause: CatchClause, scope: Scope): void {
    const catchScope = new Scope("catch", scope);
    this.graph.setScope(clause, catchScope);

    if (clause.param !== null) {
      for (const binding of bindingIdentifiers(clause.param)) {
        const sourceDeclaration = this.createDeclaration({
          kind: "catch-parameter",
          name: binding.name,
        });

        catchScope.add(sourceDeclaration);
        this.graph.bindDeclaration(binding, sourceDeclaration);
        this.context.declarations.add(sourceDeclaration);
      }
    }

    this.collectStatement(clause.body, catchScope);
  }

  private collectFunctionDeclaration(declaration: Function, scope: Scope): void {
    if (declaration.id === null) {
      throw new Error("Function declaration is missing a binding name");
    }

    const sourceDeclaration = this.createDeclaration({
      kind: "function",
      functionKind: functionKind(declaration),
      name: declaration.id.name,
      node: declaration,
    });

    scope.add(sourceDeclaration);
    this.graph.bindDeclaration(declaration.id, sourceDeclaration);
    this.context.declarations.add(sourceDeclaration);
    this.instantiation.addFunction(scope, sourceDeclaration);

    this.collectFunctionScope(declaration, scope);
  }

  private collectFunctionScope(declaration: Function, scope: Scope): void {
    const functionScope = new Scope("function", scope);
    this.graph.setScope(declaration, functionScope);

    if (declaration.type === "FunctionExpression" && declaration.id !== null) {
      const nameDeclaration = this.createDeclaration({
        kind: "lexical",
        mode: "const",
        name: declaration.id.name,
      });

      functionScope.add(nameDeclaration);
      this.graph.bindDeclaration(declaration.id, nameDeclaration);
      this.context.declarations.add(nameDeclaration);
    }

    for (const param of declaration.params) {
      for (const binding of parameterBindingIdentifiers(param)) {
        const paramDeclaration = this.createDeclaration({
          kind: "parameter",
          name: binding.name,
        });

        functionScope.add(paramDeclaration);
        this.graph.bindDeclaration(binding, paramDeclaration);
        this.context.declarations.add(paramDeclaration);
      }
    }

    if (declaration.body !== null) {
      this.graph.setScope(declaration.body, functionScope);

      for (const child of declaration.body.body) {
        this.collectStatement(child, functionScope);
      }
    }
  }

  private collectArrowFunctionExpression(expression: ArrowFunctionExpression, scope: Scope): void {
    const functionScope = new Scope("function", scope);
    this.graph.setScope(expression, functionScope);

    for (const param of expression.params) {
      for (const binding of parameterBindingIdentifiers(param)) {
        const paramDeclaration = this.createDeclaration({
          kind: "parameter",
          name: binding.name,
        });

        functionScope.add(paramDeclaration);
        this.graph.bindDeclaration(binding, paramDeclaration);
        this.context.declarations.add(paramDeclaration);
      }
    }

    if (expression.body.type === "BlockStatement") {
      this.graph.setScope(expression.body, functionScope);

      for (const child of expression.body.body) {
        this.collectStatement(child, functionScope);
      }
      return;
    }

    this.collectExpression(expression.body, functionScope);
  }

  private collectExpression(expression: Expression, scope: Scope): void {
    switch (expression.type) {
      case "Identifier":
      case "Literal":
      case "ThisExpression":
      case "MetaProperty":
      case "Super":
        return;

      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
      case "TSInstantiationExpression":
        return this.collectExpression(expression.expression, scope);

      case "ParenthesizedExpression":
      case "ChainExpression":
        return this.collectExpression(expression.expression, scope);

      case "UnaryExpression":
      case "AwaitExpression":
        return this.collectExpression(expression.argument, scope);

      case "YieldExpression":
        if (expression.argument !== null) {
          this.collectExpression(expression.argument, scope);
        }
        return;

      case "UpdateExpression":
        if (expression.argument.type === "MemberExpression") {
          this.collectExpression(expression.argument.object, scope);
          if (expression.argument.computed) {
            this.collectExpression(expression.argument.property, scope);
          }
        }
        return;

      case "BinaryExpression":
        if (expression.left.type !== "PrivateIdentifier") {
          this.collectExpression(expression.left, scope);
        }
        return this.collectExpression(expression.right, scope);

      case "LogicalExpression":
        this.collectExpression(expression.left, scope);
        this.collectExpression(expression.right, scope);
        return;

      case "AssignmentExpression":
        this.collectAssignmentTarget(expression.left, scope);
        this.collectExpression(expression.right, scope);
        return;

      case "ConditionalExpression":
        this.collectExpression(expression.test, scope);
        this.collectExpression(expression.consequent, scope);
        this.collectExpression(expression.alternate, scope);
        return;

      case "SequenceExpression":
        for (const child of expression.expressions) {
          this.collectExpression(child, scope);
        }
        return;

      case "TemplateLiteral":
        for (const child of expression.expressions) {
          this.collectExpression(child, scope);
        }
        return;

      case "ImportExpression":
        this.collectExpression(expression.source, scope);
        if (expression.options !== null) {
          this.collectExpression(expression.options, scope);
        }
        return;

      case "CallExpression":
      case "NewExpression":
        this.collectExpression(expression.callee, scope);
        for (const argument of expression.arguments) {
          this.collectArgument(argument, scope);
        }
        return;

      case "MemberExpression":
        this.collectExpression(expression.object, scope);
        if (expression.property.type !== "PrivateIdentifier" && expression.computed) {
          this.collectPropertyKey(expression.property, scope);
        }
        return;

      case "ArrayExpression":
        for (const element of expression.elements) {
          if (element !== null) this.collectArgument(element, scope);
        }
        return;

      case "ObjectExpression":
        for (const property of expression.properties) {
          if (property.type === "SpreadElement") {
            this.collectExpression(property.argument, scope);
            continue;
          }

          if (property.computed) {
            this.collectPropertyKey(property.key, scope);
          }
          this.collectExpression(property.value, scope);
        }
        return;

      case "FunctionExpression":
        return this.collectFunctionScope(expression, scope);

      case "ArrowFunctionExpression":
        return this.collectArrowFunctionExpression(expression, scope);

      case "ClassExpression":
        return this.collectClassExpression(expression, scope);

      case "JSXElement":
        for (const attribute of expression.openingElement.attributes) {
          this.collectJSXAttribute(attribute, scope);
        }
        for (const child of expression.children) {
          this.collectJSXChild(child, scope);
        }
        return;

      case "JSXFragment":
        for (const child of expression.children) {
          this.collectJSXChild(child, scope);
        }
        return;

      default:
        return;
    }
  }

  private collectJSXAttribute(attribute: JSXAttributeItem, scope: Scope): void {
    if (attribute.type === "JSXSpreadAttribute") {
      this.collectExpression(attribute.argument, scope);
      return;
    }

    const value = attribute.value;
    if (value === null || value.type === "Literal") return;

    if (value.type === "JSXExpressionContainer") {
      if (value.expression.type !== "JSXEmptyExpression") {
        this.collectExpression(value.expression, scope);
      }
      return;
    }

    this.collectExpression(value, scope);
  }

  private collectJSXChild(child: JSXChild, scope: Scope): void {
    switch (child.type) {
      case "JSXText":
        return;

      case "JSXExpressionContainer":
        if (child.expression.type !== "JSXEmptyExpression") {
          this.collectExpression(child.expression, scope);
        }
        return;

      case "JSXSpreadChild":
        this.collectExpression(child.expression, scope);
        return;

      case "JSXElement":
      case "JSXFragment":
        this.collectExpression(child, scope);
        return;
    }
  }

  private collectArgument(argument: Argument, scope: Scope): void {
    if (argument.type === "SpreadElement") {
      this.collectExpression(argument.argument, scope);
      return;
    }

    this.collectExpression(argument, scope);
  }

  private collectPropertyKey(key: PropertyKey, scope: Scope): void {
    if (key.type === "PrivateIdentifier") return;
    this.collectExpression(key, scope);
  }

  private collectAssignmentTarget(target: AssignmentTarget, scope: Scope): void {
    switch (target.type) {
      case "Identifier":
        return;

      case "MemberExpression":
        this.collectExpression(target.object, scope);
        if (target.property.type !== "PrivateIdentifier" && target.computed) {
          this.collectPropertyKey(target.property, scope);
        }
        return;

      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        this.collectAssignmentTarget(target.expression as AssignmentTarget, scope);
        return;

      case "ArrayPattern":
        for (const element of target.elements) {
          if (element !== null) this.collectAssignmentTargetElement(element, scope);
        }
        return;

      case "ObjectPattern":
        for (const property of target.properties) {
          if (property.type === "RestElement") {
            this.collectAssignmentTarget(property.argument, scope);
            continue;
          }

          if (property.computed) {
            this.collectPropertyKey(property.key, scope);
          }
          this.collectAssignmentTargetElement(property.value, scope);
        }
        return;
    }
  }

  private collectAssignmentTargetElement(
    target: AssignmentTargetMaybeDefault | AssignmentTargetRest,
    scope: Scope,
  ): void {
    if (target.type === "RestElement") {
      this.collectAssignmentTarget(target.argument, scope);
      return;
    }

    if (target.type === "AssignmentPattern") {
      this.collectAssignmentTarget(target.left, scope);
      this.collectExpression(target.right, scope);
      return;
    }

    this.collectAssignmentTarget(target, scope);
  }

  private collectClassDeclaration(declaration: Class, scope: Scope): void {
    if (declaration.id === null) {
      throw new Error("Class declaration is missing a binding name");
    }

    const sourceDeclaration = this.createDeclaration({
      kind: "lexical",
      mode: "class",
      name: declaration.id.name,
    });

    scope.add(sourceDeclaration);
    this.graph.bindDeclaration(declaration.id, sourceDeclaration);
    this.context.declarations.add(sourceDeclaration);
    this.instantiation.addLexical(scope, sourceDeclaration);

    const classScope = new Scope("block", scope);
    this.graph.setScope(declaration, classScope);

    if (declaration.body !== null) {
      this.graph.setScope(declaration.body, classScope);
    }

    if (declaration.superClass !== null) {
      this.collectExpression(declaration.superClass, scope);
    }

    this.collectClassBody(declaration, classScope);
  }

  private collectClassExpression(expression: Class, scope: Scope): void {
    const classScope = new Scope("block", scope);
    this.graph.setScope(expression, classScope);

    if (expression.id !== null) {
      const nameDeclaration = this.createDeclaration({
        kind: "lexical",
        mode: "const",
        name: expression.id.name,
      });

      classScope.add(nameDeclaration);
      this.graph.bindDeclaration(expression.id, nameDeclaration);
      this.context.declarations.add(nameDeclaration);
    }

    if (expression.body !== null) {
      this.graph.setScope(expression.body, classScope);
    }

    if (expression.superClass !== null) {
      this.collectExpression(expression.superClass, classScope);
    }

    this.collectClassBody(expression, classScope);
  }

  private collectClassBody(classNode: Class, scope: Scope): void {
    for (const element of classNode.body.body) {
      this.collectClassPrivateName(element, scope);
    }

    for (const element of classNode.body.body) {
      switch (element.type) {
        case "MethodDefinition":
          if (element.computed) {
            this.collectPropertyKey(element.key, scope);
          }
          this.collectFunctionScope(element.value, scope);
          break;

        case "PropertyDefinition":
          if (element.computed) {
            this.collectPropertyKey(element.key, scope);
          }
          if (element.value !== null) {
            this.collectExpression(element.value, scope);
          }
          break;

        case "AccessorProperty":
          throw new Error("Class auto-accessors require accessor lowering");

        case "StaticBlock":
          throw new Error("Static blocks require static block lowering");
      }
    }
  }

  private collectClassPrivateName(element: OxcClassElement, scope: Scope): void {
    if (
      element.type !== "MethodDefinition" &&
      element.type !== "PropertyDefinition" &&
      element.type !== "AccessorProperty"
    ) {
      return;
    }

    if (element.key.type !== "PrivateIdentifier") return;

    const privateName = {
      id: this.context.ids.privateNameId(),
      name: element.key.name,
    };

    scope.addPrivateName(privateName);
    this.graph.bindPrivateName(element.key, privateName);
  }

  private collectImportDeclaration(declaration: OxcImportDeclaration, scope: Scope): void {
    if (declaration.importKind === "type") return;

    for (const specifier of declaration.specifiers ?? []) {
      switch (specifier.type) {
        case "ImportSpecifier": {
          if (specifier.importKind === "type") break;

          const sourceDeclaration = this.createDeclaration({
            kind: "import",
            name: specifier.local.name,
            source: declaration.source.value,
            importedName:
              specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : specifier.imported.value,
          });

          scope.add(sourceDeclaration);
          this.graph.bindDeclaration(specifier.local, sourceDeclaration);
          this.context.declarations.add(sourceDeclaration);
          this.instantiation.addLexical(scope, sourceDeclaration);
          break;
        }

        case "ImportDefaultSpecifier": {
          const sourceDeclaration = this.createDeclaration({
            kind: "import",
            name: specifier.local.name,
            source: declaration.source.value,
            importedName: "default",
          });

          scope.add(sourceDeclaration);
          this.graph.bindDeclaration(specifier.local, sourceDeclaration);
          this.context.declarations.add(sourceDeclaration);
          this.instantiation.addLexical(scope, sourceDeclaration);
          break;
        }

        case "ImportNamespaceSpecifier": {
          const sourceDeclaration = this.createDeclaration({
            kind: "import",
            name: specifier.local.name,
            source: declaration.source.value,
            importedName: "namespace",
          });

          scope.add(sourceDeclaration);
          this.graph.bindDeclaration(specifier.local, sourceDeclaration);
          this.context.declarations.add(sourceDeclaration);
          this.instantiation.addLexical(scope, sourceDeclaration);
          break;
        }
      }
    }
  }

  private createDeclaration(declaration: DeclarationInput): Declaration {
    return {
      ...declaration,
      id: this.context.ids.declarationId(),
    };
  }
}

function nearestVarScope(scope: Scope): Scope {
  let current: Scope | null = scope;

  while (current !== null) {
    if (current.kind === "module" || current.kind === "function") {
      return current;
    }

    current = current.parent;
  }

  throw new Error("No var scope found");
}

function functionKind(
  declaration: Function,
): Extract<Declaration, { kind: "function" }>["functionKind"] {
  if (declaration.async && declaration.generator) return "async-generator";
  if (declaration.async) return "async-function";
  if (declaration.generator) return "generator";
  return "function";
}

function bindingIdentifiers(pattern: BindingPattern | BindingRestElement): BindingIdentifier[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern];

    case "ArrayPattern":
      return pattern.elements.flatMap((element) =>
        element === null ? [] : bindingIdentifiers(element),
      );

    case "ObjectPattern":
      return pattern.properties.flatMap((property) => {
        if (property.type === "RestElement") {
          return bindingIdentifiers(property.argument);
        }

        return bindingIdentifiers(property.value);
      });

    case "AssignmentPattern":
      return bindingIdentifiers(pattern.left);

    case "RestElement":
      return bindingIdentifiers(pattern.argument);
  }
}

function parameterBindingIdentifiers(param: ParamPattern): BindingIdentifier[] {
  if (param.type === "TSParameterProperty") {
    return bindingIdentifiers(param.parameter);
  }

  if (param.type === "RestElement") {
    return bindingIdentifiers(param.argument);
  }

  return bindingIdentifiers(param);
}
