import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Suppress cross-origin "Script error" overlay in development
if (process.env.NODE_ENV === "development") {
  const origError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (message === 'Script error.' && !source) return true;
    if (origError) return origError(message, source, lineno, colno, error);
  };
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
