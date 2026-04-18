import { createRoot } from "react-dom/client";
import "./index.css";
import { initClientSentry } from "./lib/sentry";

initClientSentry();

declare global {
  interface Window {
    __tweetreplyaiLoggingAllowed?: boolean;
    __tweetreplyaiConsoleGateInstalled?: boolean;
  }
}

window.__tweetreplyaiLoggingAllowed = false;

if (!window.__tweetreplyaiConsoleGateInstalled) {
  window.__tweetreplyaiConsoleGateInstalled = true;
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };
  const isAllowed = () => window.__tweetreplyaiLoggingAllowed === true;
  console.log = (...args) => {
    if (isAllowed()) originalConsole.log(...args);
  };
  console.warn = (...args) => {
    if (isAllowed()) originalConsole.warn(...args);
  };
  console.error = (...args) => {
    if (isAllowed()) originalConsole.error(...args);
  };
  console.info = (...args) => {
    if (isAllowed()) originalConsole.info(...args);
  };
  console.debug = (...args) => {
    if (isAllowed()) originalConsole.debug(...args);
  };
}

async function bootstrap() {
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
