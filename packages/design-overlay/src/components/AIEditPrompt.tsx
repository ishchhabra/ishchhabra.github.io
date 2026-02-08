import { Send, Sparkles, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { serializeElements, serializePageContext } from "@/lib/edit-types";
import type { InsertPosition } from "@/lib/edit-types";
import { useEditEngine } from "@/hooks/useEditEngine";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface AIEditPromptProps {
  /** API URL for the chat endpoint. When provided, streams tool calls and applies edits. */
  apiUrl?: string | undefined;
  /** Ollama model ID (e.g. llama3.2). Passed to API. */
  model?: string | undefined;
  /** Ollama base URL (e.g. http://localhost:11434). Passed to API. */
  ollamaBaseUrl?: string | undefined;
  /** Callback when user submits without apiUrl (e.g. for custom handling). */
  onEditRequest?: ((message: string) => void) | undefined;
  /** Placeholder text for the input. */
  placeholder?: string | undefined;
  /** Whether the prompt is in compact/toolbar mode. */
  compact?: boolean | undefined;
  /** Currently selected DOM elements. */
  selectedElements?: Element[] | undefined;
}

interface UserMessage {
  id: string;
  role: "user";
  parts: Array<{ type: "text"; text: string }>;
}

// ---------------------------------------------------------------------------
// SSE stream processing
// ---------------------------------------------------------------------------

/**
 * Parse SSE lines from a ReadableStream and invoke `onEvent` for each parsed
 * JSON payload. Handles buffering across chunk boundaries.
 */
async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, "").trim();
      if (!data || data === "[DONE]") continue;
      try {
        onEvent(JSON.parse(data) as Record<string, unknown>);
      } catch {
        // Skip malformed SSE payloads
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AIEditPrompt({
  apiUrl,
  model,
  ollamaBaseUrl,
  onEditRequest,
  placeholder = "Ask for edits...",
  compact = true,
  selectedElements = [],
}: AIEditPromptProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { applyDomWrite, applyDomInsert, undo, undoCount } = useEditEngine();
  const messagesRef = useRef<UserMessage[]>([]);

  // -- Stream handler: dispatch tool results to the edit engine ---------------

  const processStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      await consumeSSEStream(reader, (event) => {
        // tool-input-available has toolName + input; tool-output-available lacks toolName.
        // Since our server tools echo input as output, we apply from tool-input-available.
        if (event["type"] === "tool-input-available" && event["toolName"] && event["input"]) {
          const input = event["input"] as Record<string, unknown>;

          switch (event["toolName"]) {
            case "dom_write":
              applyDomWrite(
                String(input["selector"] ?? ""),
                String(input["path"] ?? ""),
                String(input["value"] ?? ""),
              );
              break;
            case "dom_insert":
              applyDomInsert(
                String(input["targetSelector"] ?? ""),
                String(input["position"] ?? "append") as InsertPosition,
                String(input["html"] ?? ""),
              );
              break;
          }
        } else if (event["type"] === "error") {
          setError(String(event["errorText"] ?? "Unknown error"));
        }
      });
    },
    [applyDomWrite, applyDomInsert],
  );

  // -- Send handler -----------------------------------------------------------

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Simple mode — no API, just callback
    if (!apiUrl) {
      onEditRequest?.(text);
      setInput("");
      return;
    }

    setIsLoading(true);
    setError(null);
    setInput("");

    // Accumulate user messages for multi-turn context
    const userMsg: UserMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    };
    messagesRef.current = [...messagesRef.current, userMsg];

    // Temporarily mark selected elements so the AI can target them via [data-i2-selected]
    const marked: Element[] = [];
    for (const el of selectedElements) {
      el.setAttribute("data-i2-selected", "true");
      marked.push(el);
    }

    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesRef.current,
          elementContext: serializeElements(selectedElements),
          pageContext: serializePageContext(),
          ...(model != null && { model }),
          ...(ollamaBaseUrl != null && { ollamaBaseUrl }),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setError(errText.slice(0, 200));
        return;
      }

      const reader = res.body?.getReader();
      if (reader) {
        await processStream(reader);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      for (const el of marked) {
        try {
          el.removeAttribute("data-i2-selected");
        } catch {
          // Element may have been removed from the DOM
        }
      }
      setIsLoading(false);
    }
  }, [
    apiUrl,
    model,
    ollamaBaseUrl,
    input,
    isLoading,
    selectedElements,
    onEditRequest,
    processStream,
  ]);

  // -- Render -----------------------------------------------------------------

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
            border: "1px solid rgba(255,255,255,0.1)",
            backgroundColor: "rgba(39,39,42,0.8)",
          }}
        >
          <Sparkles size={14} style={{ color: "rgba(161,161,170,0.8)", flexShrink: 0 }} />
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
            className="h-7 border-0 bg-transparent px-2 text-sm placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ fontSize: 12, color: "rgb(255,255,255)" }}
          />
        </div>

        <Button
          size="icon-xs"
          variant="ghost"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          title="Send"
          style={{ width: 28, height: 28, color: "rgb(161,161,170)" }}
        >
          {isLoading ? (
            <span
              style={{
                width: 14,
                height: 14,
                border: "2px solid rgba(161,161,170,0.3)",
                borderTopColor: "rgb(161,161,170)",
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
            style={{ width: 28, height: 28, color: "rgb(161,161,170)" }}
          >
            <Undo2 size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
