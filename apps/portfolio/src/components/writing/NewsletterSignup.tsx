import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { getSubscribeMutationOptions } from "../../lib/newsletter/queries";

export function NewsletterSignup({ variant = "card" }: { variant?: "card" | "inline" }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending, isSuccess, isError, error } = useMutation(
    getSubscribeMutationOptions(),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = inputRef.current?.value.trim();
    if (!email) return;
    mutate(email);
  }

  const cardClass =
    variant === "card"
      ? "rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-8 dark:border-white/5 dark:bg-white/2"
      : "";

  if (isSuccess) {
    return (
      <div className={variant === "card" ? `${cardClass} text-center` : "text-center"}>
        <div className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">You're in.</div>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-500">
          I'll send you an email when I publish something new.
        </p>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <div className="mb-1 text-sm font-medium text-zinc-900 dark:text-white">
        Want to know when I publish new articles?
      </div>
      <p className="mb-5 text-[13px] text-zinc-500 dark:text-zinc-500">
        I'll only email you when I have something new. Unsubscribe anytime.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email address"
          disabled={isPending}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-0 focus:outline-none disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white/20"
        />
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white/10 dark:hover:bg-white/15"
        >
          {isPending ? "..." : "Subscribe"}
        </button>
      </form>

      {isError && (
        <p className="mt-2.5 text-[13px] text-red-600 dark:text-red-400">
          {error instanceof Error ? error.message : "Something went wrong"}
        </p>
      )}
    </div>
  );
}
