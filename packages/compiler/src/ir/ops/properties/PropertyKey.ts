import { Value } from "../../core/Value";

export type PropertyKey =
  | { readonly kind: "static"; readonly name: string }
  | { readonly kind: "computed"; readonly value: Value };
