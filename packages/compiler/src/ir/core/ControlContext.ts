import { BlockId } from "./Block";

export interface ControlContext {
  kind: "switch" | "loop";
  breakTarget: BlockId;
  continueTarget?: BlockId;
}
