import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SettingsProvider } from "./context/SettingsContext";
import { TimeDataProvider } from "./context/TimeDataContext";
import "./_colors.css";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <TimeDataProvider>
        <App />
      </TimeDataProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
