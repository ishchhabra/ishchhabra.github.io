import type {
  Argument,
  ArrowFunctionExpression,
  AssignmentTarget,
  AssignmentTargetMaybeDefault,
  AssignmentTargetRest,
  BindingPattern,
  BindingRestElement,
  Class,
  Expression,
  Function as OxcFunction,
  ParamPattern,
  PrivateIdentifier,
  JSXAttributeItem,
  JSXChild,
  JSXElementName,
  PropertyKey,
  Program,
  Statement,
} from "oxc-parser";

import type { ScopeReferenceNode } from "../ast/types";
import type { Declaration } from "./Declaration";
import type { Scope } from "./Scope";
import type { ScopeGraph } from "./ScopeGraph";

/**
 * Resolves identifier references after declarations and scopes are known.
 */
export class ReferenceResolver {
  constructor(private readonly graph: ScopeGraph) {}

  public resolveProgram(program: Program): void {
    const scope = this.graph.scopeForOwner(program);

    for (const statement of program.body) {
      this.resolveStatement(statement, scope);
    }
  }

  private resolveStatement(statement: Statement, scope: Scope): void {
    switch (statement.type) {
      case "EmptyStatement":
      case "DebuggerStatement":
        return;

      case "BlockStatement": {
        const blockScope = this.graph.scopeForOwner(statement);
        for (const child of statement.body) {
          this.resolveStatement(child, blockScope);
        }
        return;
      }

      case "VariableDeclaration":
        for (const declarator of statement.declarations) {
          this.resolveBindingPatternInitializers(declarator.id, scope);
          if (declarator.init !== null) {
            this.resolveExpression(declarator.init, scope);
          }
        }
        return;

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

      case "FunctionDeclaration": {
        const functionScope = this.graph.scopeForOwner(statement);
        for (const param of statement.params) {
          this.resolveParameterInitializers(param, functionScope);
        }

        if (statement.body !== null) {
          for (const child of statement.body.body) {
            this.resolveStatement(child, functionScope);
          }
        }
        return;
      }

      case "ClassDeclaration": {
        if (statement.superClass !== null) {
          this.resolveExpression(statement.superClass, scope);
        }
        this.resolveClassBody(statement);
        return;
      }

      case "ImportDeclaration":
        return;

      case "ExportNamedDeclaration":
        if (statement.exportKind === "type") return;

        if (statement.declaration !== null) {
          this.resolveStatement(statement.declaration, scope);
          return;
        }

        if (statement.source !== null) return;

        for (const specifier of statement.specifiers) {
          if (specifier.exportKind === "type") continue;

          if (specifier.local.type !== "Identifier") {
            throw new Error("Local export names must be identifiers");
          }

          this.bindIdentifierReference(specifier.local, scope);
        }
        return;

      case "ExportDefaultDeclaration":
        if (statement.declaration.type === "FunctionDeclaration") {
          if (statement.declaration.id === null) {
            this.resolveFunctionExpression(statement.declaration, scope);
          } else {
            this.resolveStatement(statement.declaration, scope);
          }
          return;
        }

        if (statement.declaration.type === "ClassDeclaration") {
          if (statement.declaration.id === null) {
            this.resolveClassExpression(statement.declaration, scope);
          } else {
            this.resolveStatement(statement.declaration, scope);
          }
          return;
        }

        if (statement.declaration.type === "TSInterfaceDeclaration") {
          throw new Error("Type-only default exports are not supported");
        }

        this.resolveExpression(statement.declaration, scope);
        return;

      case "ExportAllDeclaration":
        if (statement.exportKind === "type") return;
        return;

      case "ExpressionStatement":
        this.resolveExpression(statement.expression, scope);
        return;

      case "ReturnStatement":
        if (statement.argument !== null) {
          this.resolveExpression(statement.argument, scope);
        }
        return;

      case "ThrowStatement":
        this.resolveExpression(statement.argument, scope);
        return;

      case "BreakStatement":
      case "ContinueStatement":
        return;

      case "LabeledStatement":
        this.resolveStatement(statement.body, scope);
        return;

      case "IfStatement":
        this.resolveExpression(statement.test, scope);
        this.resolveStatement(statement.consequent, scope);
        if (statement.alternate !== null) {
          this.resolveStatement(statement.alternate, scope);
        }
        return;

      case "WhileStatement":
        this.resolveExpression(statement.test, scope);
        this.resolveStatement(statement.body, scope);
        return;

      case "DoWhileStatement":
        this.resolveStatement(statement.body, scope);
        this.resolveExpression(statement.test, scope);
        return;

      case "ForStatement": {
        const loopScope = this.graph.scopeForOwner(statement);

        if (statement.init !== null) {
          if (statement.init.type === "VariableDeclaration") {
            for (const declarator of statement.init.declarations) {
              this.resolveBindingPatternInitializers(declarator.id, loopScope);
              if (declarator.init !== null) {
                this.resolveExpression(declarator.init, loopScope);
              }
            }
          } else {
            this.resolveExpression(statement.init, loopScope);
          }
        }
        if (statement.test !== null) {
          this.resolveExpression(statement.test, loopScope);
        }
        if (statement.update !== null) {
          this.resolveExpression(statement.update, loopScope);
        }
        this.resolveStatement(statement.body, loopScope);
        return;
      }

      case "SwitchStatement": {
        this.resolveExpression(statement.discriminant, scope);

        const switchScope = this.graph.scopeForOwner(statement);

        for (const switchCase of statement.cases) {
          if (switchCase.test !== null) {
            this.resolveExpression(switchCase.test, switchScope);
          }

          for (const consequent of switchCase.consequent) {
            this.resolveStatement(consequent, switchScope);
          }
        }

        return;
      }

      case "TryStatement":
        this.resolveStatement(statement.block, scope);
        if (statement.handler !== null) {
          const catchScope = this.graph.scopeForOwner(statement.handler);
          this.resolveStatement(statement.handler.body, catchScope);
        }
        if (statement.finalizer !== null) {
          this.resolveStatement(statement.finalizer, scope);
        }
        return;

      case "ForInStatement": {
        this.resolveExpression(statement.right, scope);

        const loopScope = this.graph.scopeForOwner(statement);
        if (statement.left.type === "VariableDeclaration") {
          for (const declarator of statement.left.declarations) {
            this.resolveBindingPatternInitializers(declarator.id, loopScope);
            if (declarator.init !== null) {
              throw new Error("for-in declarations cannot have initializers");
            }
          }
        } else {
          this.resolveAssignmentTarget(statement.left, loopScope);
        }

        this.resolveStatement(statement.body, loopScope);
        return;
      }

      case "ForOfStatement": {
        this.resolveExpression(statement.right, scope);

        const loopScope = this.graph.scopeForOwner(statement);
        if (statement.left.type === "VariableDeclaration") {
          for (const declarator of statement.left.declarations) {
            this.resolveBindingPatternInitializers(declarator.id, loopScope);
            if (declarator.init !== null) {
              throw new Error("for-of declarations cannot have initializers");
            }
          }
        } else {
          this.resolveAssignmentTarget(statement.left, loopScope);
        }

        this.resolveStatement(statement.body, loopScope);
        return;
      }

      default:
        throw new Error(`Unsupported reference resolution: ${statement.type}`);
    }
  }

  private resolveExpression(expression: Expression, scope: Scope): void {
    switch (expression.type) {
      case "Identifier":
        this.bindIdentifierReference(expression, scope);
        return;

      case "Literal":
      case "ThisExpression":
      case "MetaProperty":
      case "Super":
        return;

      case "ParenthesizedExpression":
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
      case "TSInstantiationExpression":
        this.resolveExpression(expression.expression, scope);
        return;

      case "BinaryExpression":
        if (expression.left.type === "PrivateIdentifier") {
          this.bindPrivateNameReference(expression.left, scope);
        } else {
          this.resolveExpression(expression.left, scope);
        }
        this.resolveExpression(expression.right, scope);
        return;

      case "LogicalExpression":
        this.resolveExpression(expression.left, scope);
        this.resolveExpression(expression.right, scope);
        return;

      case "UnaryExpression":
      case "AwaitExpression":
        this.resolveExpression(expression.argument, scope);
        return;

      case "YieldExpression":
        if (expression.argument !== null) {
          this.resolveExpression(expression.argument, scope);
        }
        return;

      case "AssignmentExpression":
        this.resolveAssignmentTarget(expression.left, scope);
        this.resolveExpression(expression.right, scope);
        return;

      case "UpdateExpression":
        this.resolveAssignmentTarget(expression.argument, scope);
        return;

      case "ConditionalExpression":
        this.resolveExpression(expression.test, scope);
        this.resolveExpression(expression.consequent, scope);
        this.resolveExpression(expression.alternate, scope);
        return;

      case "SequenceExpression":
        for (const child of expression.expressions) {
          this.resolveExpression(child, scope);
        }
        return;

      case "TemplateLiteral":
        for (const child of expression.expressions) {
          this.resolveExpression(child, scope);
        }
        return;

      case "ImportExpression":
        this.resolveExpression(expression.source, scope);
        if (expression.options !== null) {
          this.resolveExpression(expression.options, scope);
        }
        return;

      case "MemberExpression":
        this.resolveExpression(expression.object, scope);
        if (expression.property.type === "PrivateIdentifier") {
          this.bindPrivateNameReference(expression.property, scope);
        } else if (expression.computed) {
          this.resolvePropertyKey(expression.property, scope);
        }
        return;

      case "CallExpression":
      case "NewExpression":
        this.resolveExpression(expression.callee, scope);
        for (const argument of expression.arguments) {
          this.resolveArgument(argument, scope);
        }
        return;

      case "ArrayExpression":
        for (const element of expression.elements) {
          if (element !== null) this.resolveArgument(element, scope);
        }
        return;

      case "ObjectExpression":
        for (const property of expression.properties) {
          if (property.type === "SpreadElement") {
            this.resolveExpression(property.argument, scope);
            continue;
          }

          if (property.computed) {
            this.resolvePropertyKey(property.key, scope);
          }
          this.resolveExpression(property.value, scope);
        }
        return;

      case "ChainExpression":
        this.resolveExpression(expression.expression, scope);
        return;

      case "ClassExpression":
        return this.resolveClassExpression(expression, scope);

      case "FunctionExpression":
        return this.resolveFunctionExpression(expression, scope);

      case "ArrowFunctionExpression":
        return this.resolveArrowFunctionExpression(expression, scope);

      case "JSXElement":
        this.resolveJSXElementName(expression.openingElement.name, scope);
        for (const attribute of expression.openingElement.attributes) {
          this.resolveJSXAttribute(attribute, scope);
        }
        for (const child of expression.children) {
          this.resolveJSXChild(child, scope);
        }
        return;

      case "JSXFragment":
        for (const child of expression.children) {
          this.resolveJSXChild(child, scope);
        }
        return;

      default:
        throw new Error(`Unsupported reference expression: ${expression.type}`);
    }
  }

  private resolveJSXElementName(name: JSXElementName, scope: Scope, forceReference = false): void {
    switch (name.type) {
      case "JSXIdentifier":
        if (forceReference || !isIntrinsicJSXName(name.name)) {
          this.bindIdentifierReference(name, scope);
        }
        return;

      case "JSXMemberExpression":
        this.resolveJSXElementName(name.object, scope, true);
        return;

      case "JSXNamespacedName":
        return;
    }
  }

  private resolveJSXAttribute(attribute: JSXAttributeItem, scope: Scope): void {
    if (attribute.type === "JSXSpreadAttribute") {
      this.resolveExpression(attribute.argument, scope);
      return;
    }

    const value = attribute.value;
    if (value === null || value.type === "Literal") return;

    if (value.type === "JSXExpressionContainer") {
      if (value.expression.type !== "JSXEmptyExpression") {
        this.resolveExpression(value.expression, scope);
      }
      return;
    }

    this.resolveExpression(value, scope);
  }

  private resolveJSXChild(child: JSXChild, scope: Scope): void {
    switch (child.type) {
      case "JSXText":
        return;

      case "JSXExpressionContainer":
        if (child.expression.type !== "JSXEmptyExpression") {
          this.resolveExpression(child.expression, scope);
        }
        return;

      case "JSXSpreadChild":
        this.resolveExpression(child.expression, scope);
        return;

      case "JSXElement":
      case "JSXFragment":
        this.resolveExpression(child, scope);
        return;
    }
  }

  private resolveArgument(argument: Argument, scope: Scope): void {
    if (argument.type === "SpreadElement") {
      this.resolveExpression(argument.argument, scope);
      return;
    }

    this.resolveExpression(argument, scope);
  }

  private resolveClassExpression(expression: Class, scope: Scope): void {
    if (expression.superClass !== null) {
      this.resolveExpression(expression.superClass, scope);
    }

    this.resolveClassBody(expression);
  }

  private resolveClassBody(classNode: Class): void {
    const classScope = this.graph.scopeForOwner(classNode);

    for (const element of classNode.body.body) {
      switch (element.type) {
        case "MethodDefinition": {
          if (element.computed) {
            this.resolvePropertyKey(element.key, classScope);
          }

          const methodScope = this.graph.scopeForOwner(element.value);
          for (const param of element.value.params) {
            this.resolveParameterInitializers(param, methodScope);
          }

          if (element.value.body !== null) {
            for (const child of element.value.body.body) {
              this.resolveStatement(child, methodScope);
            }
          }
          break;
        }

        case "PropertyDefinition":
          if (element.computed) {
            this.resolvePropertyKey(element.key, classScope);
          }
          if (element.value !== null) {
            this.resolveExpression(element.value, classScope);
          }
          break;

        case "AccessorProperty":
          throw new Error("Class auto-accessors require accessor lowering");

        case "StaticBlock":
          throw new Error("Static blocks require static block lowering");
      }
    }
  }

  private resolveFunctionExpression(expression: OxcFunction, _scope: Scope): void {
    const functionScope = this.graph.scopeForOwner(expression);
    for (const param of expression.params) {
      this.resolveParameterInitializers(param, functionScope);
    }

    if (expression.body !== null) {
      for (const child of expression.body.body) {
        this.resolveStatement(child, functionScope);
      }
    }
  }

  private resolveArrowFunctionExpression(expression: ArrowFunctionExpression, _scope: Scope): void {
    const functionScope = this.graph.scopeForOwner(expression);
    for (const param of expression.params) {
      this.resolveParameterInitializers(param, functionScope);
    }

    if (expression.body.type === "BlockStatement") {
      for (const child of expression.body.body) {
        this.resolveStatement(child, functionScope);
      }
      return;
    }

    this.resolveExpression(expression.body, functionScope);
  }

  private resolveAssignmentTarget(target: AssignmentTarget, scope: Scope): void {
    switch (target.type) {
      case "Identifier":
        this.bindIdentifierReference(target, scope);
        return;

      case "MemberExpression":
        this.resolveExpression(target.object, scope);
        if (target.property.type === "PrivateIdentifier") {
          this.bindPrivateNameReference(target.property, scope);
        } else if (target.computed) {
          this.resolvePropertyKey(target.property, scope);
        }
        return;

      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        this.resolveAssignmentTarget(target.expression as AssignmentTarget, scope);
        return;

      case "ArrayPattern":
        for (const element of target.elements) {
          if (element !== null) this.resolveAssignmentTargetElement(element, scope);
        }
        return;

      case "ObjectPattern":
        for (const property of target.properties) {
          if (property.type === "RestElement") {
            this.resolveAssignmentTarget(property.argument, scope);
            continue;
          }

          if (property.computed) {
            this.resolvePropertyKey(property.key, scope);
          }
          this.resolveAssignmentTargetElement(property.value, scope);
        }
        return;
    }
  }

  private resolveAssignmentTargetElement(
    target: AssignmentTargetMaybeDefault | AssignmentTargetRest,
    scope: Scope,
  ): void {
    if (target.type === "RestElement") {
      this.resolveAssignmentTarget(target.argument, scope);
      return;
    }

    if (target.type === "AssignmentPattern") {
      this.resolveAssignmentTarget(target.left, scope);
      this.resolveExpression(target.right, scope);
      return;
    }

    this.resolveAssignmentTarget(target, scope);
  }

  private resolveBindingPatternInitializers(
    pattern: BindingPattern | BindingRestElement,
    scope: Scope,
  ): void {
    switch (pattern.type) {
      case "Identifier":
        return;

      case "ArrayPattern":
        for (const element of pattern.elements) {
          if (element !== null) {
            this.resolveBindingPatternInitializers(element, scope);
          }
        }
        return;

      case "ObjectPattern":
        for (const property of pattern.properties) {
          if (property.type === "RestElement") {
            this.resolveBindingPatternInitializers(property.argument, scope);
            continue;
          }

          if (property.computed) {
            this.resolvePropertyKey(property.key, scope);
          }
          this.resolveBindingPatternInitializers(property.value, scope);
        }
        return;

      case "AssignmentPattern":
        this.resolveBindingPatternInitializers(pattern.left, scope);
        this.resolveExpression(pattern.right, scope);
        return;

      case "RestElement":
        this.resolveBindingPatternInitializers(pattern.argument, scope);
        return;
    }
  }

  private resolveParameterInitializers(param: ParamPattern, scope: Scope): void {
    if (param.type === "TSParameterProperty") {
      this.resolveParameterInitializers(param.parameter, scope);
      return;
    }

    if (param.type === "RestElement") {
      this.resolveBindingPatternInitializers(param.argument, scope);
      return;
    }

    this.resolveBindingPatternInitializers(param, scope);
  }

  private resolvePropertyKey(key: PropertyKey, scope: Scope): void {
    if (key.type === "PrivateIdentifier") return;
    this.resolveExpression(key, scope);
  }

  private bindPrivateNameReference(identifier: PrivateIdentifier, scope: Scope): void {
    const privateName = scope.resolvePrivateName(identifier.name);
    if (privateName === undefined) {
      throw new Error(`Unresolved private name: #${identifier.name}`);
    }

    this.graph.bindPrivateName(identifier, privateName);
  }

  private bindIdentifierReference(identifier: ScopeReferenceNode, scope: Scope): void {
    const declaration = scope.resolve(identifier.name);
    if (declaration === undefined) {
      this.graph.bindGlobalReference(identifier);
      return;
    }

    this.graph.bindReference(identifier, declaration);
    this.recordCrossFunctionCaptures(scope, declaration);
  }

  private recordCrossFunctionCaptures(referenceScope: Scope, declaration: Declaration): void {
    const declarationScope = declarationScopeFor(referenceScope, declaration);
    const declarationFunctionScope = nearestFunctionScope(declarationScope);

    for (
      let functionScope = nearestFunctionScope(referenceScope);
      functionScope !== null && functionScope !== declarationFunctionScope;
      functionScope = nearestFunctionScope(functionScope.parent)
    ) {
      this.graph.recordCapture(functionScope, declaration);
    }
  }
}

function declarationScopeFor(scope: Scope, declaration: Declaration): Scope {
  for (let current: Scope | null = scope; current !== null; current = current.parent) {
    if (current.declarations.includes(declaration)) return current;
  }

  throw new Error(`Declaration ${declaration.name} is not visible from reference scope`);
}

function nearestFunctionScope(scope: Scope | null): Scope | null {
  for (let current = scope; current !== null; current = current.parent) {
    if (current.kind === "function") return current;
  }

  return null;
}

function isIntrinsicJSXName(name: string): boolean {
  return /^[a-z]/.test(name);
}
