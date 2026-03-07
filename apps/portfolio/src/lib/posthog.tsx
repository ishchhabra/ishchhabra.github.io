import { PostHogProvider as PHProvider } from "posthog-js/react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const options = {
    api_host: import.meta.env["VITE_POSTHOG_HOST"],
    api_key: import.meta.env["VITE_POSTHOG_KEY"],
    defaults: "2026-01-30",
  } as const;

  return (
    <PHProvider apiKey={import.meta.env["VITE_POSTHOG_KEY"]} options={options}>
      {children}
    </PHProvider>
  );
}
