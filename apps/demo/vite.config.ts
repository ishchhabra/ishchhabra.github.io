import { designOverlayApiPlugin } from "@i2-labs/design-overlay/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), designOverlayApiPlugin()],
  optimizeDeps: {
    // Don't pre-bundle workspace packages — always use latest build
    exclude: ["@i2-labs/sandbox"],
  },
});
