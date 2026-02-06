import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Overlay } from "@i2-labs/design-overlay";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Overlay />
  </StrictMode>,
);
