import type { Context, Visitors } from "esrap";
import tsx from "esrap/languages/tsx";

import type {
  ExportAllDeclarationNode,
  ExportNamedDeclarationNode,
  ExportSpecifierNode,
  IdentifierNode,
  ImportAttributeNode,
  ImportDeclarationNode,
  ImportSpecifierNode,
  LiteralNode,
} from "./ast";

type PrintableNode = { readonly type: string };
type PrintContext = Pick<Context, "write" | "visit">;
type EsrapLanguage = ReturnType<typeof tsx>;

/**
 * JavaScript printer language used by the compiler.
 *
 * esrap's TSX printer covers most ESTree syntax we emit, but its module
 * printer does not yet preserve every modern module edge case. These overrides
 * keep the compiler's static import/export records lossless for string-literal
 * module names and import attributes.
 */
export function javascriptLanguage(): Visitors {
  const language = {
    ...tsx(),

    ImportDeclaration(node: PrintableNode, context: PrintContext): void {
      const importDeclaration = node as ImportDeclarationNode;
      context.write("import ");

      if (importDeclaration.specifiers.length === 0) {
        context.visit(importDeclaration.source);
        writeImportAttributes(importDeclaration.attributes, context);
        context.write(";");
        return;
      }

      const defaultSpecifier = importDeclaration.specifiers.find(
        (specifier) => specifier.type === "ImportDefaultSpecifier",
      );
      const namespaceSpecifier = importDeclaration.specifiers.find(
        (specifier) => specifier.type === "ImportNamespaceSpecifier",
      );
      const namedSpecifiers = importDeclaration.specifiers.filter(
        (specifier) => specifier.type === "ImportSpecifier",
      ) as ImportSpecifierNode[];

      let needsComma = false;

      if (defaultSpecifier?.type === "ImportDefaultSpecifier") {
        context.visit(defaultSpecifier.local);
        needsComma = namespaceSpecifier !== undefined || namedSpecifiers.length > 0;
      }

      if (namespaceSpecifier?.type === "ImportNamespaceSpecifier") {
        if (needsComma) context.write(", ");
        context.write("* as ");
        context.visit(namespaceSpecifier.local);
        needsComma = false;
      }

      if (namedSpecifiers.length > 0) {
        if (needsComma) context.write(", ");
        context.write("{ ");
        writeCommaSeparated(namedSpecifiers, context);
        context.write(" }");
      }

      context.write(" from ");
      context.visit(importDeclaration.source);
      writeImportAttributes(importDeclaration.attributes, context);
      context.write(";");
    },

    ImportSpecifier(node: PrintableNode, context: PrintContext): void {
      const specifier = node as ImportSpecifierNode;
      context.visit(specifier.imported);
      if (!sameModuleName(specifier.imported, specifier.local)) {
        context.write(" as ");
        context.visit(specifier.local);
      }
    },

    ImportAttribute(node: PrintableNode, context: PrintContext): void {
      writeImportAttribute(node as ImportAttributeNode, context);
    },

    ExportNamedDeclaration(node: PrintableNode, context: PrintContext): void {
      const exportDeclaration = node as ExportNamedDeclarationNode;
      context.write("export { ");
      writeCommaSeparated(exportDeclaration.specifiers, context);
      context.write(" }");

      if (exportDeclaration.source !== null) {
        context.write(" from ");
        context.visit(exportDeclaration.source);
        writeImportAttributes(exportDeclaration.attributes, context);
      }

      context.write(";");
    },

    ExportSpecifier(node: PrintableNode, context: PrintContext): void {
      const specifier = node as ExportSpecifierNode;
      context.visit(specifier.local);
      if (!sameModuleName(specifier.local, specifier.exported)) {
        context.write(" as ");
        context.visit(specifier.exported);
      }
    },

    ExportAllDeclaration(node: PrintableNode, context: PrintContext): void {
      const exportDeclaration = node as ExportAllDeclarationNode;
      context.write("export *");

      if (exportDeclaration.exported !== null) {
        context.write(" as ");
        context.visit(exportDeclaration.exported);
      }

      context.write(" from ");
      context.visit(exportDeclaration.source);
      writeImportAttributes(exportDeclaration.attributes, context);
      context.write(";");
    },
  };

  return language as unknown as EsrapLanguage;
}

function writeImportAttributes(
  attributes: readonly ImportAttributeNode[],
  context: PrintContext,
): void {
  if (attributes.length === 0) return;

  context.write(" with { ");
  writeCommaSeparated(attributes, context);
  context.write(" }");
}

function writeImportAttribute(node: ImportAttributeNode, context: PrintContext): void {
  context.visit(node.key);
  context.write(": ");
  context.visit(node.value);
}

function writeCommaSeparated(nodes: readonly PrintableNode[], context: PrintContext): void {
  for (let index = 0; index < nodes.length; index++) {
    if (index > 0) context.write(", ");
    context.visit(nodes[index]);
  }
}

function sameModuleName(
  left: IdentifierNode | LiteralNode,
  right: IdentifierNode | LiteralNode,
): boolean {
  return moduleNameText(left) === moduleNameText(right);
}

function moduleNameText(node: IdentifierNode | LiteralNode): string {
  if (node.type === "Identifier") return node.name;
  if (typeof node.value !== "string") {
    throw new Error("Module import/export names must be strings");
  }

  return node.value;
}
