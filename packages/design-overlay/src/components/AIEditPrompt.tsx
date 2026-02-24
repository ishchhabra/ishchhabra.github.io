import { useEditEngine } from "@/hooks/useEditEngine";
import { runLocalChat, type LocalMessage } from "@/lib/ai-client";
import type { InsertPosition } from "@/lib/edit-types";
import { serializeElements, serializePageContext } from "@/lib/edit-types";
import { Send, Sparkles, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { LocalAIConfig } from "./SettingsModal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface AIEditPromptProps {
  config: LocalAIConfig;
  onEditRequest?: ((message: string) => void) | undefined;
  placeholder?: string | undefined;
  compact?: boolean | undefined;
  selectedElements?: Element[] | undefined;
}

export function AIEditPrompt({
  config,
  onEditRequest,
  placeholder = "Ask for edits...",
  compact = true,
  selectedElements = [],
}: AIEditPromptProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { applyDomWrite, applyDomInsert, undo, undoCount } = useEditEngine();
  const messagesRef = useRef<LocalMessage[]>([]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!config.baseUrl || !config.model) {
      if (onEditRequest) {
        onEditRequest(text);
        setInput("");
      } else {
        setError("Local API config is missing.");
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setInput("");

    const userMsg: LocalMessage = {
      role: "user",
      content: text,
    };
    messagesRef.current = [...messagesRef.current, userMsg];

    const marked: Element[] = [];
    for (const el of selectedElements) {
      el.setAttribute("data-i2-selected", "true");
      marked.push(el);
    }

    try {
      await runLocalChat(
        messagesRef.current,
        serializeElements(selectedElements),
        serializePageContext(),
        config,
        {
          dom_write: {
            description: "Modify existing elements. Path format: style.<property> | text | html | attr.<name> | class.<name> | -class.<name>",
            parameters: {
              type: "object",
              properties: {
                selector: { type: "string" },
                path: { type: "string" },
                value: { type: "string" }
              },
              required: ["selector", "path", "value"]
            },
            execute: async ({ selector, path, value }: { selector: string; path: string; value: string }) => {
              applyDomWrite(selector, path, value);
              return `Successfully wrote path ${path} to selector ${selector}`;
            }
          },
          dom_insert: {
            description: "Insert new HTML. Position: before | after | prepend | append",
            parameters: {
              type: "object",
              properties: {
                targetSelector: { type: "string" },
                position: { type: "string", enum: ["before", "after", "prepend", "append"] },
                html: { type: "string" }
              },
              required: ["targetSelector", "position", "html"]
            },
            execute: async ({ targetSelector, position, html }: { targetSelector: string; position: string; html: string }) => {
              applyDomInsert(targetSelector, position as InsertPosition, html);
              return `Successfully inserted html ${position} ${targetSelector}`;
            }
          },
          dom_read: {
            description: "Inspect an element. (Context is already provided to you) Read is limited.",
            parameters: {
              type: "object",
              properties: {
                selector: { type: "string" },
                path: { type: "string" }
              },
              required: ["selector", "path"]
            },
            execute: async () => { 
                return "Client side dom_read not fully supported. Look at the initial element context provided in your prompt."; 
            }
          }
        }
      );

    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      for (const el of marked) {
        try {
          el.removeAttribute("data-i2-selected");
        } catch {
          // Element may have been removed
        }
      }
      setIsLoading(false);
    }
  }, [
    config,
    input,
    isLoading,
    selectedElements,
    onEditRequest,
    applyDomWrite,
    applyDomInsert
  ]);

  const hasSelection = selectedElements.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {error && (
        <div
          style={{
            fontSize: 11,
            color: "rgb(239,68,68)",
            maxWidth: 280,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          minWidth: compact ? 200 : 280,
          maxWidth: compact ? 340 : 420,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 6px",
            borderRadius: 8,
            border: "1px solid var(--overlay-bar-border)",
            backgroundColor: "var(--input)",
          }}
        >
          <Sparkles size={14} style={{ color: "var(--overlay-bar-muted)", flexShrink: 0 }} />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              hasSelection ? placeholder : "e.g. make all buttons white, add a section..."
            }
            disabled={isLoading}
            className="h-7 border-0 bg-transparent px-2 text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ fontSize: 12, color: "var(--foreground)" }}
          />
        </div>

        <Button
          size="icon-xs"
          variant="ghost"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          title="Send Local AI Request"
          style={{ width: 28, height: 28, color: "var(--overlay-bar-muted)" }}
        >
          {isLoading ? (
            <span
              style={{
                width: 14,
                height: 14,
                border: "2px solid var(--overlay-bar-muted)",
                borderTopColor: "var(--foreground)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          ) : (
            <Send size={14} />
          )}
        </Button>

        {undoCount > 0 && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => undo()}
            title="Undo last edit"
            style={{ width: 28, height: 28, color: "var(--overlay-bar-muted)" }}
          >
            <Undo2 size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
