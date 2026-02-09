import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "view-transitions-polyfill";
import { Layout } from "./components/Layout";
import "./index.css";
import { DesignOverlayDemo } from "./pages/DesignOverlayDemo";
import { Home } from "./pages/Home";
import { SandboxPlayground } from "./pages/SandboxPlayground";
import { Writing } from "./pages/Writing";
import { PnpmMonorepoArticle } from "./pages/writing/PnpmMonorepoArticle";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/lab/sandbox", element: <SandboxPlayground /> },
      { path: "/lab/design-overlay", element: <DesignOverlayDemo /> },
      { path: "/writing", element: <Writing /> },
      {
        path: "/writing/pnpm-monorepo-scales",
        element: <PnpmMonorepoArticle />,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
