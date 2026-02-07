function App() {
  return (
    <div className="relative min-h-svh bg-zinc-950">
      {/* Subtle gradient mesh background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, 0.15), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139, 92, 246, 0.08), transparent)",
        }}
      />

      {/* i2-labs landing - dark, refined, distinctive */}
      <header className="relative border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span
            className="font-display text-xl font-semibold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            i2 labs
          </span>
          <nav className="flex gap-8 text-sm">
            <a href="#" className="text-zinc-400 transition-colors hover:text-white">
              About
            </a>
            <a href="#" className="text-zinc-400 transition-colors hover:text-white">
              Projects
            </a>
            <a href="#" className="text-zinc-400 transition-colors hover:text-white">
              Contact
            </a>
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 py-32">
        <section className="max-w-3xl">
          <h1
            className="font-display mb-8 text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Experimentation
            <br />
            <span className="text-zinc-500">and tooling.</span>
          </h1>
          <p className="max-w-xl text-lg text-zinc-400">
            Modern web development, refined. We build tools and explore ideas at the edge of what's
            possible.
          </p>
          <div className="mt-12 flex gap-4">
            <a
              href="#"
              className="rounded-full bg-white px-6 py-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-200"
            >
              Get started
            </a>
            <a
              href="#"
              className="rounded-full border border-white/10 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
            >
              View projects
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
