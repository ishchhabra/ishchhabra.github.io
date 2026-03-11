import { PostHogProvider as PHProvider } from "posthog-js/react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const options = {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
  } as const;

  return (
    <PHProvider apiKey={import.meta.env["VITE_POSTHOG_KEY"]} options={options}>
      {children}
    </PHProvider>
  );
}
