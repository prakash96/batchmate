import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/app.css";

//  AG GRID STYLES (KEEP THESE)
import "ag-grid-community/styles/ag-theme-quartz.css";

import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";


//  REGISTER MODULES
ModuleRegistry.registerModules([
  AllCommunityModule
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);