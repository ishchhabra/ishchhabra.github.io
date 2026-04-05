import { isKeyword } from "@babel/helper-validator-identifier";
import * as t from "@babel/types";

export function toIdentifierOrStringLiteral(name: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(name) || isKeyword(name) ? t.identifier(name) : t.stringLiteral(name);
}
