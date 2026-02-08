import { useCallback, useEffect, useRef, useState } from "react";
import { buildSrcdoc } from "./srcdoc";
import { CapabilityBroker } from "./broker";
import { PermissionPrompt } from "./PermissionPrompt";
import type { CapabilityConfig, CapabilityRequest, PendingRequest } from "./types";

export interface SandboxProps {
  /** Props to pass to the sandboxed component. */
  props?: Record<string, unknown>;
  /** Container className. */
  className?: string;
  /** Container style. */
  style?: React.CSSProperties;
  /** Called when the sandbox encounters an error. */
  onError?: (error: Error) => void;
  /** Called when the sandbox has rendered. */
  onRender?: () => void;
  /** Capability and permission configuration. */
  capabilities?: CapabilityConfig;
}

/**
 * Sandboxed React renderer with capability-based security.
 *
 * Renders AI/user-provided React code in a secure iframe with CSP isolation.
 * Pass the code string as children.
 *
 * When sandbox code requests a capability (fetch, storage, clipboard, cookie),
 * the user is prompted for permission (allow once, allow always, deny once, deny always).
 */
export function Sandbox({
  children,
  props: sandboxProps = {},
  className,
  style,
  onError,
  onRender,
  capabilities: capConfig,
}: SandboxProps & { children: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingRequest | null>(null);
  const propsRef = useRef(sandboxProps);
  propsRef.current = sandboxProps;

  const srcdoc = buildSrcdoc();

  // Create broker once
  const brokerRef = useRef<CapabilityBroker | null>(null);
  if (!brokerRef.current) {
    brokerRef.current = new CapabilityBroker(
      capConfig?.capabilities ?? [],
      capConfig?.permissions ?? [],
      {
        onPrompt: (pending) => setPendingPrompt(pending),
        onPromptResolved: () => setPendingPrompt(null),
      },
    );
  }

  // Handle messages from the sandbox
  const handleMessage = useCallback(
    async (e: MessageEvent) => {
      const iframe = iframeRef.current;

      if (!iframe || e.source !== iframe.contentWindow) return;

      switch (e.data?.type) {
        case "sandbox:ready":
          setReady(true);
          break;

        case "sandbox:rendered":
          onRender?.();
          break;

        case "sandbox:error": {
          const err = new Error(e.data.error?.message ?? "Sandbox error");
          if (e.data.error?.stack) err.stack = e.data.error.stack;
          onError?.(err);
          break;
        }

        case "sandbox:capability": {
          const req = e.data as CapabilityRequest;
          const broker = brokerRef.current;
          if (!broker) return;

          const response = await broker.handleRequest(req);
          iframe.contentWindow?.postMessage(
            {
              type: "sandbox:capability-response",
              id: req.id,
              result: response.result,
              error: response.error,
            },
            "*",
          );
          break;
        }
      }
    },
    [onError, onRender],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Send code when ready
  useEffect(() => {
    if (!ready || !iframeRef.current?.contentWindow) return;

    const code = typeof children === "string" ? children : "";
    if (!code.trim()) return;

    iframeRef.current.contentWindow.postMessage(
      {
        type: "sandbox:render",
        code,
        props: propsRef.current,
      },
      "*",
    );
  }, [ready, children]);

  // Send updated props
  useEffect(() => {
    if (!ready || !iframeRef.current?.contentWindow) return;

    iframeRef.current.contentWindow.postMessage(
      {
        type: "sandbox:update-props",
        props: propsRef.current,
      },
      "*",
    );
  }, [ready, sandboxProps]);

  return (
    <>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        allow="fullscreen 'none'; camera 'none'; microphone 'none'; geolocation 'none'"
        className={className}
        style={{
          border: "none",
          width: "100%",
          minHeight: 200,
          display: "block",
          ...style,
        }}
        title="Sandbox"
      />

      {pendingPrompt && <PermissionPrompt request={pendingPrompt} />}
    </>
  );
}
