import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface OverlayProps {
  /** Optional className for the overlay container */
  className?: string;
}

/**
 * Framer-style on-page editing overlay.
 * Renders via Portal to document.body so it truly floats above all content.
 */
export default function Overlay({ className }: OverlayProps) {
  const [open, setOpen] = useState(false);

  const overlayContent = (
    <>
      {/* Framer-style Edit button - pill on right edge */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed right-6 top-1/2 z-[10001] -translate-y-1/2 rounded-full border border-white/10 bg-zinc-900/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-zinc-800 hover:border-white/20",
          open && "right-[344px]",
          className
        )}
        title={open ? "Finish editing" : "Edit"}
      >
        {open ? "Done" : "Edit"}
      </button>

      {/* Slide-out panel - overlays page */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-[10000] flex w-[320px] flex-col border-l border-white/10 bg-zinc-900/98 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
          {/* Editor bar header - Framer style */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-medium text-zinc-300">Edit</span>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="flex flex-row flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Select"
                className="h-8 w-8 rounded-md bg-white/5 p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ↖
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Pen"
                className="h-8 w-8 rounded-md bg-white/5 p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ✎
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Brush"
                className="h-8 w-8 rounded-md bg-white/10 p-0 text-white"
              >
                🖌
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Eraser"
                className="h-8 w-8 rounded-md bg-white/5 p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ⊘
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Rectangle"
                className="h-8 w-8 rounded-md bg-white/5 p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ▭
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                title="Ellipse"
                className="h-8 w-8 rounded-md bg-white/5 p-0 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                ○
              </Button>
            </div>
            <Separator className="bg-white/10" />
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">Fill</span>
              <input
                type="color"
                defaultValue="#3b82f6"
                className="h-8 w-8 cursor-pointer rounded-md border border-white/10 bg-white/5 p-1"
                title="Fill color"
              />
            </div>
            <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/5 text-center text-sm text-zinc-500">
              Canvas — click to draw
            </div>
          </div>
        </div>
    </>
  );

  return overlayContent;
}
