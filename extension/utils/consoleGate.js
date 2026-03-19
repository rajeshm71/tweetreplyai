const GLOBAL_FLAG_KEY = '__tweetreplyaiExtLoggingAllowed';
const GLOBAL_STATE_KEY = '__tweetreplyaiConsoleGateState';

export function installConsoleGate(getAllowed) {
  const state = globalThis[GLOBAL_STATE_KEY];
  if (state?.installed) {
    state.getAllowed = getAllowed;
    return;
  }

  const originals = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  const sharedState = {
    installed: true,
    getAllowed,
    originals,
  };
  globalThis[GLOBAL_STATE_KEY] = sharedState;

  const allowed = () => {
    try {
      return sharedState.getAllowed?.() === true;
    } catch {
      return false;
    }
  };

  console.log = (...args) => {
    if (allowed()) originals.log(...args);
  };
  console.warn = (...args) => {
    if (allowed()) originals.warn(...args);
  };
  console.error = (...args) => {
    if (allowed()) originals.error(...args);
  };
  console.info = (...args) => {
    if (allowed()) originals.info(...args);
  };
  console.debug = (...args) => {
    if (allowed()) originals.debug(...args);
  };
}

if (typeof globalThis[GLOBAL_FLAG_KEY] !== 'boolean') {
  globalThis[GLOBAL_FLAG_KEY] = false;
}
