import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { SandboxPlayground } from "./pages/SandboxPlayground";
import { DesignOverlayDemo } from "./pages/DesignOverlayDemo";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/lab/sandbox" element={<SandboxPlayground />} />
        <Route path="/lab/design-overlay" element={<DesignOverlayDemo />} />
      </Route>
    </Routes>
  );
}

export default App;
