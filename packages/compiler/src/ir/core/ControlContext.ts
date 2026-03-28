import { BlockId } from "./Block";

export type ControlContext =
  | { kind: "loop"; label?: string; breakTarget: BlockId; continueTarget: BlockId }
  | { kind: "switch"; label?: string; breakTarget: BlockId }
  | { kind: "label"; label: string; breakTarget: BlockId };
