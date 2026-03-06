import { createContext, useContext, type ReactNode } from "react";

export type RenderMode = "interactive" | "rss";

const RenderModeContext = createContext<RenderMode>("interactive");

export function RenderModeProvider({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return <RenderModeContext value={mode}>{children}</RenderModeContext>;
}

export function useRenderMode(): RenderMode {
  return useContext(RenderModeContext);
}
