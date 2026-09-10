import { createRoot } from "react-dom/client";
import StageOpsApp from "@/components/stageops-app";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StageOpsApp operator={window.location.pathname.replace(/\/$/, "") === "/operator"} />,
);
