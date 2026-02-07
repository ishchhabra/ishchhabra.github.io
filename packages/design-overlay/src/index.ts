export { type OverlayProps, default as Overlay } from "./components/Overlay";
export { useElementSelection } from "./hooks/useElementSelection";
export { useEditEngine } from "./hooks/useEditEngine";
export type {
  EditOperation,
  ElementContext,
  EditHistoryEntry,
  ElementSnapshot,
  InsertPosition,
  PageContext,
} from "./lib/edit-types";
export { serializeElement, serializeElements, serializePageContext } from "./lib/edit-types";
