"use strict";
(() => {
  // node_modules/@sentry/core/build/esm/debug-build.js
  var DEBUG_BUILD = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;

  // node_modules/@sentry/core/build/esm/utils/worldwide.js
  var GLOBAL_OBJ = globalThis;

  // node_modules/@sentry/core/build/esm/utils/version.js
  var SDK_VERSION = "10.49.0";

  // node_modules/@sentry/core/build/esm/carrier.js
  function getMainCarrier() {
    getSentryCarrier(GLOBAL_OBJ);
    return GLOBAL_OBJ;
  }
  function getSentryCarrier(carrier) {
    const __SENTRY__ = carrier.__SENTRY__ = carrier.__SENTRY__ || {};
    __SENTRY__.version = __SENTRY__.version || SDK_VERSION;
    return __SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {};
  }
  function getGlobalSingleton(name, creator, obj = GLOBAL_OBJ) {
    const __SENTRY__ = obj.__SENTRY__ = obj.__SENTRY__ || {};
    const carrier = __SENTRY__[SDK_VERSION] = __SENTRY__[SDK_VERSION] || {};
    return carrier[name] || (carrier[name] = creator());
  }

  // node_modules/@sentry/core/build/esm/utils/debug-logger.js
  var CONSOLE_LEVELS = [
    "debug",
    "info",
    "warn",
    "error",
    "log",
    "assert",
    "trace"
  ];
  var PREFIX = "Sentry Logger ";
  var originalConsoleMethods = {};
  function consoleSandbox(callback) {
    if (!("console" in GLOBAL_OBJ)) {
      return callback();
    }
    const console2 = GLOBAL_OBJ.console;
    const wrappedFuncs = {};
    const wrappedLevels = Object.keys(originalConsoleMethods);
    wrappedLevels.forEach((level) => {
      const originalConsoleMethod = originalConsoleMethods[level];
      wrappedFuncs[level] = console2[level];
      console2[level] = originalConsoleMethod;
    });
    try {
      return callback();
    } finally {
      wrappedLevels.forEach((level) => {
        console2[level] = wrappedFuncs[level];
      });
    }
  }
  function enable() {
    _getLoggerSettings().enabled = true;
  }
  function disable() {
    _getLoggerSettings().enabled = false;
  }
  function isEnabled() {
    return _getLoggerSettings().enabled;
  }
  function log(...args) {
    _maybeLog("log", ...args);
  }
  function warn(...args) {
    _maybeLog("warn", ...args);
  }
  function error(...args) {
    _maybeLog("error", ...args);
  }
  function _maybeLog(level, ...args) {
    if (!DEBUG_BUILD) {
      return;
    }
    if (isEnabled()) {
      consoleSandbox(() => {
        GLOBAL_OBJ.console[level](`${PREFIX}[${level}]:`, ...args);
      });
    }
  }
  function _getLoggerSettings() {
    if (!DEBUG_BUILD) {
      return { enabled: false };
    }
    return getGlobalSingleton("loggerSettings", () => ({ enabled: false }));
  }
  var debug = {
    /** Enable logging. */
    enable,
    /** Disable logging. */
    disable,
    /** Check if logging is enabled. */
    isEnabled,
    /** Log a message. */
    log,
    /** Log a warning. */
    warn,
    /** Log an error. */
    error
  };

  // node_modules/@sentry/core/build/esm/utils/stacktrace.js
  var STACKTRACE_FRAME_LIMIT = 50;
  var UNKNOWN_FUNCTION = "?";
  var WEBPACK_ERROR_REGEXP = /\(error: (.*)\)/;
  var STRIP_FRAME_REGEXP = /captureMessage|captureException/;
  function createStackParser(...parsers) {
    const sortedParsers = parsers.sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    return (stack, skipFirstLines = 0, framesToPop = 0) => {
      const frames = [];
      const lines = stack.split("\n");
      for (let i = skipFirstLines; i < lines.length; i++) {
        let line = lines[i];
        if (line.length > 1024) {
          line = line.slice(0, 1024);
        }
        const cleanedLine = WEBPACK_ERROR_REGEXP.test(line) ? line.replace(WEBPACK_ERROR_REGEXP, "$1") : line;
        if (cleanedLine.includes("Error: ")) {
          continue;
        }
        for (const parser of sortedParsers) {
          const frame = parser(cleanedLine);
          if (frame) {
            frames.push(frame);
            break;
          }
        }
        if (frames.length >= STACKTRACE_FRAME_LIMIT + framesToPop) {
          break;
        }
      }
      return stripSentryFramesAndReverse(frames.slice(framesToPop));
    };
  }
  function stackParserFromStackParserOptions(stackParser) {
    if (Array.isArray(stackParser)) {
      return createStackParser(...stackParser);
    }
    return stackParser;
  }
  function stripSentryFramesAndReverse(stack) {
    if (!stack.length) {
      return [];
    }
    const localStack = Array.from(stack);
    if (/sentryWrapped/.test(getLastStackFrame(localStack).function || "")) {
      localStack.pop();
    }
    localStack.reverse();
    if (STRIP_FRAME_REGEXP.test(getLastStackFrame(localStack).function || "")) {
      localStack.pop();
      if (STRIP_FRAME_REGEXP.test(getLastStackFrame(localStack).function || "")) {
        localStack.pop();
      }
    }
    return localStack.slice(0, STACKTRACE_FRAME_LIMIT).map((frame) => ({
      ...frame,
      filename: frame.filename || getLastStackFrame(localStack).filename,
      function: frame.function || UNKNOWN_FUNCTION
    }));
  }
  function getLastStackFrame(arr) {
    return arr[arr.length - 1] || {};
  }
  var defaultFunctionName = "<anonymous>";
  function getFunctionName(fn) {
    try {
      if (!fn || typeof fn !== "function") {
        return defaultFunctionName;
      }
      return fn.name || defaultFunctionName;
    } catch {
      return defaultFunctionName;
    }
  }
  function getFramesFromEvent(event) {
    const exception = event.exception;
    if (exception) {
      const frames = [];
      try {
        exception.values.forEach((value) => {
          if (value.stacktrace.frames) {
            frames.push(...value.stacktrace.frames);
          }
        });
        return frames;
      } catch {
        return void 0;
      }
    }
    return void 0;
  }
  function getVueInternalName(value) {
    const isVNode = "__v_isVNode" in value && value.__v_isVNode;
    return isVNode ? "[VueVNode]" : "[VueViewModel]";
  }

  // node_modules/@sentry/core/build/esm/instrument/handlers.js
  var handlers = {};
  var instrumented = {};
  function addHandler(type, handler) {
    handlers[type] = handlers[type] || [];
    handlers[type].push(handler);
  }
  function maybeInstrument(type, instrumentFn) {
    if (!instrumented[type]) {
      instrumented[type] = true;
      try {
        instrumentFn();
      } catch (e) {
        DEBUG_BUILD && debug.error(`Error while instrumenting ${type}`, e);
      }
    }
  }
  function triggerHandlers(type, data) {
    const typeHandlers = type && handlers[type];
    if (!typeHandlers) {
      return;
    }
    for (const handler of typeHandlers) {
      try {
        handler(data);
      } catch (e) {
        DEBUG_BUILD && debug.error(
          `Error while triggering instrumentation handler.
Type: ${type}
Name: ${getFunctionName(handler)}
Error:`,
          e
        );
      }
    }
  }

  // node_modules/@sentry/core/build/esm/instrument/globalError.js
  var _oldOnErrorHandler = null;
  function addGlobalErrorInstrumentationHandler(handler) {
    const type = "error";
    addHandler(type, handler);
    maybeInstrument(type, instrumentError);
  }
  function instrumentError() {
    _oldOnErrorHandler = GLOBAL_OBJ.onerror;
    GLOBAL_OBJ.onerror = function(msg, url, line, column, error2) {
      const handlerData = {
        column,
        error: error2,
        line,
        msg,
        url
      };
      triggerHandlers("error", handlerData);
      if (_oldOnErrorHandler) {
        return _oldOnErrorHandler.apply(this, arguments);
      }
      return false;
    };
    GLOBAL_OBJ.onerror.__SENTRY_INSTRUMENTED__ = true;
  }

  // node_modules/@sentry/core/build/esm/instrument/globalUnhandledRejection.js
  var _oldOnUnhandledRejectionHandler = null;
  function addGlobalUnhandledRejectionInstrumentationHandler(handler) {
    const type = "unhandledrejection";
    addHandler(type, handler);
    maybeInstrument(type, instrumentUnhandledRejection);
  }
  function instrumentUnhandledRejection() {
    _oldOnUnhandledRejectionHandler = GLOBAL_OBJ.onunhandledrejection;
    GLOBAL_OBJ.onunhandledrejection = function(e) {
      const handlerData = e;
      triggerHandlers("unhandledrejection", handlerData);
      if (_oldOnUnhandledRejectionHandler) {
        return _oldOnUnhandledRejectionHandler.apply(this, arguments);
      }
      return true;
    };
    GLOBAL_OBJ.onunhandledrejection.__SENTRY_INSTRUMENTED__ = true;
  }

  // node_modules/@sentry/core/build/esm/utils/is.js
  var objectToString = Object.prototype.toString;
  function isError(wat) {
    switch (objectToString.call(wat)) {
      case "[object Error]":
      case "[object Exception]":
      case "[object DOMException]":
      case "[object WebAssembly.Exception]":
        return true;
      default:
        return isInstanceOf(wat, Error);
    }
  }
  function isBuiltin(wat, className) {
    return objectToString.call(wat) === `[object ${className}]`;
  }
  function isErrorEvent(wat) {
    return isBuiltin(wat, "ErrorEvent");
  }
  function isDOMError(wat) {
    return isBuiltin(wat, "DOMError");
  }
  function isDOMException(wat) {
    return isBuiltin(wat, "DOMException");
  }
  function isString(wat) {
    return isBuiltin(wat, "String");
  }
  function isParameterizedString(wat) {
    return typeof wat === "object" && wat !== null && "__sentry_template_string__" in wat && "__sentry_template_values__" in wat;
  }
  function isPrimitive(wat) {
    return wat === null || isParameterizedString(wat) || typeof wat !== "object" && typeof wat !== "function";
  }
  function isPlainObject(wat) {
    return isBuiltin(wat, "Object");
  }
  function isEvent(wat) {
    return typeof Event !== "undefined" && isInstanceOf(wat, Event);
  }
  function isElement(wat) {
    return typeof Element !== "undefined" && isInstanceOf(wat, Element);
  }
  function isRegExp(wat) {
    return isBuiltin(wat, "RegExp");
  }
  function isThenable(wat) {
    return Boolean(wat?.then && typeof wat.then === "function");
  }
  function isSyntheticEvent(wat) {
    return isPlainObject(wat) && "nativeEvent" in wat && "preventDefault" in wat && "stopPropagation" in wat;
  }
  function isInstanceOf(wat, base) {
    try {
      return wat instanceof base;
    } catch {
      return false;
    }
  }
  function isVueViewModel(wat) {
    return !!(typeof wat === "object" && wat !== null && (wat.__isVue || wat._isVue || wat.__v_isVNode));
  }
  function isRequest(request) {
    return typeof Request !== "undefined" && isInstanceOf(request, Request);
  }

  // node_modules/@sentry/core/build/esm/utils/browser.js
  var WINDOW = GLOBAL_OBJ;
  var DEFAULT_MAX_STRING_LENGTH = 80;
  function htmlTreeAsString(elem, options = {}) {
    if (!elem) {
      return "<unknown>";
    }
    try {
      let currentElem = elem;
      const MAX_TRAVERSE_HEIGHT = 5;
      const out = [];
      let height = 0;
      let len = 0;
      const separator = " > ";
      const sepLength = separator.length;
      let nextStr;
      const keyAttrs = Array.isArray(options) ? options : options.keyAttrs;
      const maxStringLength = !Array.isArray(options) && options.maxStringLength || DEFAULT_MAX_STRING_LENGTH;
      while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
        nextStr = _htmlElementAsString(currentElem, keyAttrs);
        if (nextStr === "html" || height > 1 && len + out.length * sepLength + nextStr.length >= maxStringLength) {
          break;
        }
        out.push(nextStr);
        len += nextStr.length;
        currentElem = currentElem.parentNode;
      }
      return out.reverse().join(separator);
    } catch {
      return "<unknown>";
    }
  }
  function _htmlElementAsString(el, keyAttrs) {
    const elem = el;
    const out = [];
    if (!elem?.tagName) {
      return "";
    }
    if (WINDOW.HTMLElement) {
      if (elem instanceof HTMLElement && elem.dataset) {
        if (elem.dataset["sentryComponent"]) {
          return elem.dataset["sentryComponent"];
        }
        if (elem.dataset["sentryElement"]) {
          return elem.dataset["sentryElement"];
        }
      }
    }
    out.push(elem.tagName.toLowerCase());
    const keyAttrPairs = keyAttrs?.length ? keyAttrs.filter((keyAttr) => elem.getAttribute(keyAttr)).map((keyAttr) => [keyAttr, elem.getAttribute(keyAttr)]) : null;
    if (keyAttrPairs?.length) {
      keyAttrPairs.forEach((keyAttrPair) => {
        out.push(`[${keyAttrPair[0]}="${keyAttrPair[1]}"]`);
      });
    } else {
      if (elem.id) {
        out.push(`#${elem.id}`);
      }
      const className = elem.className;
      if (className && isString(className)) {
        const classes = className.split(/\s+/);
        for (const c of classes) {
          out.push(`.${c}`);
        }
      }
    }
    for (const k of ["aria-label", "type", "name", "title", "alt"]) {
      const attr = elem.getAttribute(k);
      if (attr) {
        out.push(`[${k}="${attr}"]`);
      }
    }
    return out.join("");
  }
  function getLocationHref() {
    try {
      return WINDOW.document.location.href;
    } catch {
      return "";
    }
  }
  function getComponentName(elem, maxTraverseHeight = 5) {
    if (!WINDOW.HTMLElement) {
      return null;
    }
    let currentElem = elem;
    for (let i = 0; i < maxTraverseHeight; i++) {
      if (!currentElem) {
        return null;
      }
      if (currentElem instanceof HTMLElement) {
        if (currentElem.dataset["sentryComponent"]) {
          return currentElem.dataset["sentryComponent"];
        }
        if (currentElem.dataset["sentryElement"]) {
          return currentElem.dataset["sentryElement"];
        }
      }
      currentElem = currentElem.parentNode;
    }
    return null;
  }

  // node_modules/@sentry/core/build/esm/utils/object.js
  function fill(source, name, replacementFactory) {
    if (!(name in source)) {
      return;
    }
    const original = source[name];
    if (typeof original !== "function") {
      return;
    }
    const wrapped = replacementFactory(original);
    if (typeof wrapped === "function") {
      markFunctionWrapped(wrapped, original);
    }
    try {
      source[name] = wrapped;
    } catch {
      DEBUG_BUILD && debug.log(`Failed to replace method "${name}" in object`, source);
    }
  }
  function addNonEnumerableProperty(obj, name, value) {
    try {
      Object.defineProperty(obj, name, {
        // enumerable: false, // the default, so we can save on bundle size by not explicitly setting it
        value,
        writable: true,
        configurable: true
      });
    } catch {
      DEBUG_BUILD && debug.log(`Failed to add non-enumerable property "${name}" to object`, obj);
    }
  }
  function markFunctionWrapped(wrapped, original) {
    try {
      const proto = original.prototype || {};
      wrapped.prototype = original.prototype = proto;
      addNonEnumerableProperty(wrapped, "__sentry_original__", original);
    } catch {
    }
  }
  function getOriginalFunction(func) {
    return func.__sentry_original__;
  }
  function convertToPlainObject(value) {
    if (isError(value)) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack,
        ...getOwnProperties(value)
      };
    } else if (isEvent(value)) {
      const newObj = {
        type: value.type,
        target: serializeEventTarget(value.target),
        currentTarget: serializeEventTarget(value.currentTarget),
        ...getOwnProperties(value)
      };
      if (typeof CustomEvent !== "undefined" && isInstanceOf(value, CustomEvent)) {
        newObj.detail = value.detail;
      }
      return newObj;
    } else {
      return value;
    }
  }
  function serializeEventTarget(target) {
    try {
      return isElement(target) ? htmlTreeAsString(target) : Object.prototype.toString.call(target);
    } catch {
      return "<unknown>";
    }
  }
  function getOwnProperties(obj) {
    if (typeof obj === "object" && obj !== null) {
      return Object.fromEntries(Object.entries(obj));
    }
    return {};
  }
  function extractExceptionKeysForMessage(exception) {
    const keys = Object.keys(convertToPlainObject(exception));
    keys.sort();
    return !keys[0] ? "[object has no keys]" : keys.join(", ");
  }

  // node_modules/@sentry/core/build/esm/utils/randomSafeContext.js
  var RESOLVED_RUNNER;
  function withRandomSafeContext(cb) {
    if (RESOLVED_RUNNER !== void 0) {
      return RESOLVED_RUNNER ? RESOLVED_RUNNER(cb) : cb();
    }
    const sym = Symbol.for("__SENTRY_SAFE_RANDOM_ID_WRAPPER__");
    const globalWithSymbol = GLOBAL_OBJ;
    if (sym in globalWithSymbol && typeof globalWithSymbol[sym] === "function") {
      RESOLVED_RUNNER = globalWithSymbol[sym];
      return RESOLVED_RUNNER(cb);
    }
    RESOLVED_RUNNER = null;
    return cb();
  }
  function safeMathRandom() {
    return withRandomSafeContext(() => Math.random());
  }
  function safeDateNow() {
    return withRandomSafeContext(() => Date.now());
  }

  // node_modules/@sentry/core/build/esm/utils/string.js
  function truncate(str, max = 0) {
    if (typeof str !== "string" || max === 0) {
      return str;
    }
    return str.length <= max ? str : `${str.slice(0, max)}...`;
  }
  function safeJoin(input, delimiter) {
    if (!Array.isArray(input)) {
      return "";
    }
    const output = [];
    for (let i = 0; i < input.length; i++) {
      const value = input[i];
      try {
        if (isVueViewModel(value)) {
          output.push(getVueInternalName(value));
        } else {
          output.push(String(value));
        }
      } catch {
        output.push("[value cannot be serialized]");
      }
    }
    return output.join(delimiter);
  }
  function isMatchingPattern(value, pattern, requireExactStringMatch = false) {
    if (!isString(value)) {
      return false;
    }
    if (isRegExp(pattern)) {
      return pattern.test(value);
    }
    if (isString(pattern)) {
      return requireExactStringMatch ? value === pattern : value.includes(pattern);
    }
    if (typeof pattern === "function") {
      return pattern(value);
    }
    return false;
  }
  function stringMatchesSomePattern(testString, patterns = [], requireExactStringMatch = false) {
    return patterns.some((pattern) => isMatchingPattern(testString, pattern, requireExactStringMatch));
  }

  // node_modules/@sentry/core/build/esm/utils/misc.js
  function getCrypto() {
    const gbl = GLOBAL_OBJ;
    return gbl.crypto || gbl.msCrypto;
  }
  var emptyUuid;
  function getRandomByte() {
    return safeMathRandom() * 16;
  }
  function uuid4(crypto2 = getCrypto()) {
    try {
      if (crypto2?.randomUUID) {
        return withRandomSafeContext(() => crypto2.randomUUID()).replace(/-/g, "");
      }
    } catch {
    }
    if (!emptyUuid) {
      emptyUuid = "10000000100040008000" + 1e11;
    }
    return emptyUuid.replace(
      /[018]/g,
      (c) => (
        // eslint-disable-next-line no-bitwise
        (c ^ (getRandomByte() & 15) >> c / 4).toString(16)
      )
    );
  }
  function getFirstException(event) {
    return event.exception?.values?.[0];
  }
  function getEventDescription(event) {
    const { message, event_id: eventId } = event;
    if (message) {
      return message;
    }
    const firstException = getFirstException(event);
    if (firstException) {
      if (firstException.type && firstException.value) {
        return `${firstException.type}: ${firstException.value}`;
      }
      return firstException.type || firstException.value || eventId || "<unknown>";
    }
    return eventId || "<unknown>";
  }
  function addExceptionTypeValue(event, value, type) {
    const exception = event.exception = event.exception || {};
    const values = exception.values = exception.values || [];
    const firstException = values[0] = values[0] || {};
    if (!firstException.value) {
      firstException.value = value || "";
    }
    if (!firstException.type) {
      firstException.type = type || "Error";
    }
  }
  function addExceptionMechanism(event, newMechanism) {
    const firstException = getFirstException(event);
    if (!firstException) {
      return;
    }
    const defaultMechanism = { type: "generic", handled: true };
    const currentMechanism = firstException.mechanism;
    firstException.mechanism = { ...defaultMechanism, ...currentMechanism, ...newMechanism };
    if (newMechanism && "data" in newMechanism) {
      const mergedData = { ...currentMechanism?.data, ...newMechanism.data };
      firstException.mechanism.data = mergedData;
    }
  }
  function checkOrSetAlreadyCaught(exception) {
    if (isAlreadyCaptured(exception)) {
      return true;
    }
    try {
      addNonEnumerableProperty(exception, "__sentry_captured__", true);
    } catch {
    }
    return false;
  }
  function isAlreadyCaptured(exception) {
    try {
      return exception.__sentry_captured__;
    } catch {
    }
  }

  // node_modules/@sentry/core/build/esm/utils/time.js
  var ONE_SECOND_IN_MS = 1e3;
  function dateTimestampInSeconds() {
    return safeDateNow() / ONE_SECOND_IN_MS;
  }
  function createUnixTimestampInSecondsFunc() {
    const { performance } = GLOBAL_OBJ;
    if (!performance?.now || !performance.timeOrigin) {
      return dateTimestampInSeconds;
    }
    const timeOrigin = performance.timeOrigin;
    return () => {
      return (timeOrigin + withRandomSafeContext(() => performance.now())) / ONE_SECOND_IN_MS;
    };
  }
  var _cachedTimestampInSeconds;
  function timestampInSeconds() {
    const func = _cachedTimestampInSeconds ?? (_cachedTimestampInSeconds = createUnixTimestampInSecondsFunc());
    return func();
  }

  // node_modules/@sentry/core/build/esm/session.js
  function makeSession(context) {
    const startingTime = timestampInSeconds();
    const session = {
      sid: uuid4(),
      init: true,
      timestamp: startingTime,
      started: startingTime,
      duration: 0,
      status: "ok",
      errors: 0,
      ignoreDuration: false,
      toJSON: () => sessionToJSON(session)
    };
    if (context) {
      updateSession(session, context);
    }
    return session;
  }
  function updateSession(session, context = {}) {
    if (context.user) {
      if (!session.ipAddress && context.user.ip_address) {
        session.ipAddress = context.user.ip_address;
      }
      if (!session.did && !context.did) {
        session.did = context.user.id || context.user.email || context.user.username;
      }
    }
    session.timestamp = context.timestamp || timestampInSeconds();
    if (context.abnormal_mechanism) {
      session.abnormal_mechanism = context.abnormal_mechanism;
    }
    if (context.ignoreDuration) {
      session.ignoreDuration = context.ignoreDuration;
    }
    if (context.sid) {
      session.sid = context.sid.length === 32 ? context.sid : uuid4();
    }
    if (context.init !== void 0) {
      session.init = context.init;
    }
    if (!session.did && context.did) {
      session.did = `${context.did}`;
    }
    if (typeof context.started === "number") {
      session.started = context.started;
    }
    if (session.ignoreDuration) {
      session.duration = void 0;
    } else if (typeof context.duration === "number") {
      session.duration = context.duration;
    } else {
      const duration = session.timestamp - session.started;
      session.duration = duration >= 0 ? duration : 0;
    }
    if (context.release) {
      session.release = context.release;
    }
    if (context.environment) {
      session.environment = context.environment;
    }
    if (!session.ipAddress && context.ipAddress) {
      session.ipAddress = context.ipAddress;
    }
    if (!session.userAgent && context.userAgent) {
      session.userAgent = context.userAgent;
    }
    if (typeof context.errors === "number") {
      session.errors = context.errors;
    }
    if (context.status) {
      session.status = context.status;
    }
  }
  function closeSession(session, status) {
    let context = {};
    if (status) {
      context = { status };
    } else if (session.status === "ok") {
      context = { status: "exited" };
    }
    updateSession(session, context);
  }
  function sessionToJSON(session) {
    return {
      sid: `${session.sid}`,
      init: session.init,
      // Make sure that sec is converted to ms for date constructor
      started: new Date(session.started * 1e3).toISOString(),
      timestamp: new Date(session.timestamp * 1e3).toISOString(),
      status: session.status,
      errors: session.errors,
      did: typeof session.did === "number" || typeof session.did === "string" ? `${session.did}` : void 0,
      duration: session.duration,
      abnormal_mechanism: session.abnormal_mechanism,
      attrs: {
        release: session.release,
        environment: session.environment,
        ip_address: session.ipAddress,
        user_agent: session.userAgent
      }
    };
  }

  // node_modules/@sentry/core/build/esm/utils/merge.js
  function merge(initialObj, mergeObj, levels = 2) {
    if (!mergeObj || typeof mergeObj !== "object" || levels <= 0) {
      return mergeObj;
    }
    if (initialObj && Object.keys(mergeObj).length === 0) {
      return initialObj;
    }
    const output = { ...initialObj };
    for (const key in mergeObj) {
      if (Object.prototype.hasOwnProperty.call(mergeObj, key)) {
        output[key] = merge(output[key], mergeObj[key], levels - 1);
      }
    }
    return output;
  }

  // node_modules/@sentry/core/build/esm/utils/propagationContext.js
  function generateTraceId() {
    return uuid4();
  }
  function generateSpanId() {
    return uuid4().substring(16);
  }

  // node_modules/@sentry/core/build/esm/utils/spanOnScope.js
  var SCOPE_SPAN_FIELD = "_sentrySpan";
  function _setSpanForScope(scope, span) {
    if (span) {
      addNonEnumerableProperty(scope, SCOPE_SPAN_FIELD, span);
    } else {
      delete scope[SCOPE_SPAN_FIELD];
    }
  }
  function _getSpanForScope(scope) {
    return scope[SCOPE_SPAN_FIELD];
  }

  // node_modules/@sentry/core/build/esm/scope.js
  var DEFAULT_MAX_BREADCRUMBS = 100;
  var Scope = class _Scope {
    /** Flag if notifying is happening. */
    /** Callback for client to receive scope changes. */
    /** Callback list that will be called during event processing. */
    /** Array of breadcrumbs. */
    /** User */
    /** Tags */
    /** Attributes */
    /** Extra */
    /** Contexts */
    /** Attachments */
    /** Propagation Context for distributed tracing */
    /**
     * A place to stash data which is needed at some point in the SDK's event processing pipeline but which shouldn't get
     * sent to Sentry
     */
    /** Fingerprint */
    /** Severity */
    /**
     * Transaction Name
     *
     * IMPORTANT: The transaction name on the scope has nothing to do with root spans/transaction objects.
     * It's purpose is to assign a transaction to the scope that's added to non-transaction events.
     */
    /** Session */
    /** The client on this scope */
    /** Contains the last event id of a captured event.  */
    /** Conversation ID */
    // NOTE: Any field which gets added here should get added not only to the constructor but also to the `clone` method.
    constructor() {
      this._notifyingListeners = false;
      this._scopeListeners = [];
      this._eventProcessors = [];
      this._breadcrumbs = [];
      this._attachments = [];
      this._user = {};
      this._tags = {};
      this._attributes = {};
      this._extra = {};
      this._contexts = {};
      this._sdkProcessingMetadata = {};
      this._propagationContext = {
        traceId: generateTraceId(),
        sampleRand: safeMathRandom()
      };
    }
    /**
     * Clone all data from this scope into a new scope.
     */
    clone() {
      const newScope = new _Scope();
      newScope._breadcrumbs = [...this._breadcrumbs];
      newScope._tags = { ...this._tags };
      newScope._attributes = { ...this._attributes };
      newScope._extra = { ...this._extra };
      newScope._contexts = { ...this._contexts };
      if (this._contexts.flags) {
        newScope._contexts.flags = {
          values: [...this._contexts.flags.values]
        };
      }
      newScope._user = this._user;
      newScope._level = this._level;
      newScope._session = this._session;
      newScope._transactionName = this._transactionName;
      newScope._fingerprint = this._fingerprint;
      newScope._eventProcessors = [...this._eventProcessors];
      newScope._attachments = [...this._attachments];
      newScope._sdkProcessingMetadata = { ...this._sdkProcessingMetadata };
      newScope._propagationContext = { ...this._propagationContext };
      newScope._client = this._client;
      newScope._lastEventId = this._lastEventId;
      newScope._conversationId = this._conversationId;
      _setSpanForScope(newScope, _getSpanForScope(this));
      return newScope;
    }
    /**
     * Update the client assigned to this scope.
     * Note that not every scope will have a client assigned - isolation scopes & the global scope will generally not have a client,
     * as well as manually created scopes.
     */
    setClient(client) {
      this._client = client;
    }
    /**
     * Set the ID of the last captured error event.
     * This is generally only captured on the isolation scope.
     */
    setLastEventId(lastEventId2) {
      this._lastEventId = lastEventId2;
    }
    /**
     * Get the client assigned to this scope.
     */
    getClient() {
      return this._client;
    }
    /**
     * Get the ID of the last captured error event.
     * This is generally only available on the isolation scope.
     */
    lastEventId() {
      return this._lastEventId;
    }
    /**
     * @inheritDoc
     */
    addScopeListener(callback) {
      this._scopeListeners.push(callback);
    }
    /**
     * Add an event processor that will be called before an event is sent.
     */
    addEventProcessor(callback) {
      this._eventProcessors.push(callback);
      return this;
    }
    /**
     * Set the user for this scope.
     * Set to `null` to unset the user.
     */
    setUser(user) {
      this._user = user || {
        email: void 0,
        id: void 0,
        ip_address: void 0,
        username: void 0
      };
      if (this._session) {
        updateSession(this._session, { user });
      }
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Get the user from this scope.
     */
    getUser() {
      return this._user;
    }
    /**
     * Set the conversation ID for this scope.
     * Set to `null` to unset the conversation ID.
     */
    setConversationId(conversationId) {
      this._conversationId = conversationId || void 0;
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Set an object that will be merged into existing tags on the scope,
     * and will be sent as tags data with the event.
     */
    setTags(tags) {
      this._tags = {
        ...this._tags,
        ...tags
      };
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Set a single tag that will be sent as tags data with the event.
     */
    setTag(key, value) {
      return this.setTags({ [key]: value });
    }
    /**
     * Sets attributes onto the scope.
     *
     * These attributes are currently applied to logs and metrics.
     * In the future, they will also be applied to spans.
     *
     * Important: For now, only strings, numbers and boolean attributes are supported, despite types allowing for
     * more complex attribute types. We'll add this support in the future but already specify the wider type to
     * avoid a breaking change in the future.
     *
     * @param newAttributes - The attributes to set on the scope. You can either pass in key-value pairs, or
     * an object with a `value` and an optional `unit` (if applicable to your attribute).
     *
     * @example
     * ```typescript
     * scope.setAttributes({
     *   is_admin: true,
     *   payment_selection: 'credit_card',
     *   render_duration: { value: 'render_duration', unit: 'ms' },
     * });
     * ```
     */
    setAttributes(newAttributes) {
      this._attributes = {
        ...this._attributes,
        ...newAttributes
      };
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Sets an attribute onto the scope.
     *
     * These attributes are currently applied to logs and metrics.
     * In the future, they will also be applied to spans.
     *
     * Important: For now, only strings, numbers and boolean attributes are supported, despite types allowing for
     * more complex attribute types. We'll add this support in the future but already specify the wider type to
     * avoid a breaking change in the future.
     *
     * @param key - The attribute key.
     * @param value - the attribute value. You can either pass in a raw value, or an attribute
     * object with a `value` and an optional `unit` (if applicable to your attribute).
     *
     * @example
     * ```typescript
     * scope.setAttribute('is_admin', true);
     * scope.setAttribute('render_duration', { value: 'render_duration', unit: 'ms' });
     * ```
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAttribute(key, value) {
      return this.setAttributes({ [key]: value });
    }
    /**
     * Removes the attribute with the given key from the scope.
     *
     * @param key - The attribute key.
     *
     * @example
     * ```typescript
     * scope.removeAttribute('is_admin');
     * ```
     */
    removeAttribute(key) {
      if (key in this._attributes) {
        delete this._attributes[key];
        this._notifyScopeListeners();
      }
      return this;
    }
    /**
     * Set an object that will be merged into existing extra on the scope,
     * and will be sent as extra data with the event.
     */
    setExtras(extras) {
      this._extra = {
        ...this._extra,
        ...extras
      };
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Set a single key:value extra entry that will be sent as extra data with the event.
     */
    setExtra(key, extra) {
      this._extra = { ...this._extra, [key]: extra };
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Sets the fingerprint on the scope to send with the events.
     * @param {string[]} fingerprint Fingerprint to group events in Sentry.
     */
    setFingerprint(fingerprint) {
      this._fingerprint = fingerprint;
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Sets the level on the scope for future events.
     */
    setLevel(level) {
      this._level = level;
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Sets the transaction name on the scope so that the name of e.g. taken server route or
     * the page location is attached to future events.
     *
     * IMPORTANT: Calling this function does NOT change the name of the currently active
     * root span. If you want to change the name of the active root span, use
     * `Sentry.updateSpanName(rootSpan, 'new name')` instead.
     *
     * By default, the SDK updates the scope's transaction name automatically on sensible
     * occasions, such as a page navigation or when handling a new request on the server.
     */
    setTransactionName(name) {
      this._transactionName = name;
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Sets context data with the given name.
     * Data passed as context will be normalized. You can also pass `null` to unset the context.
     * Note that context data will not be merged - calling `setContext` will overwrite an existing context with the same key.
     */
    setContext(key, context) {
      if (context === null) {
        delete this._contexts[key];
      } else {
        this._contexts[key] = context;
      }
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Set the session for the scope.
     */
    setSession(session) {
      if (!session) {
        delete this._session;
      } else {
        this._session = session;
      }
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Get the session from the scope.
     */
    getSession() {
      return this._session;
    }
    /**
     * Updates the scope with provided data. Can work in three variations:
     * - plain object containing updatable attributes
     * - Scope instance that'll extract the attributes from
     * - callback function that'll receive the current scope as an argument and allow for modifications
     */
    update(captureContext) {
      if (!captureContext) {
        return this;
      }
      const scopeToMerge = typeof captureContext === "function" ? captureContext(this) : captureContext;
      const scopeInstance = scopeToMerge instanceof _Scope ? scopeToMerge.getScopeData() : isPlainObject(scopeToMerge) ? captureContext : void 0;
      const {
        tags,
        attributes,
        extra,
        user,
        contexts,
        level,
        fingerprint = [],
        propagationContext,
        conversationId
      } = scopeInstance || {};
      this._tags = { ...this._tags, ...tags };
      this._attributes = { ...this._attributes, ...attributes };
      this._extra = { ...this._extra, ...extra };
      this._contexts = { ...this._contexts, ...contexts };
      if (user && Object.keys(user).length) {
        this._user = user;
      }
      if (level) {
        this._level = level;
      }
      if (fingerprint.length) {
        this._fingerprint = fingerprint;
      }
      if (propagationContext) {
        this._propagationContext = propagationContext;
      }
      if (conversationId) {
        this._conversationId = conversationId;
      }
      return this;
    }
    /**
     * Clears the current scope and resets its properties.
     * Note: The client will not be cleared.
     */
    clear() {
      this._breadcrumbs = [];
      this._tags = {};
      this._attributes = {};
      this._extra = {};
      this._user = {};
      this._contexts = {};
      this._level = void 0;
      this._transactionName = void 0;
      this._fingerprint = void 0;
      this._session = void 0;
      this._conversationId = void 0;
      _setSpanForScope(this, void 0);
      this._attachments = [];
      this.setPropagationContext({
        traceId: generateTraceId(),
        sampleRand: safeMathRandom()
      });
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Adds a breadcrumb to the scope.
     * By default, the last 100 breadcrumbs are kept.
     */
    addBreadcrumb(breadcrumb, maxBreadcrumbs) {
      const maxCrumbs = typeof maxBreadcrumbs === "number" ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;
      if (maxCrumbs <= 0) {
        return this;
      }
      const mergedBreadcrumb = {
        timestamp: dateTimestampInSeconds(),
        ...breadcrumb,
        // Breadcrumb messages can theoretically be infinitely large and they're held in memory so we truncate them not to leak (too much) memory
        message: breadcrumb.message ? truncate(breadcrumb.message, 2048) : breadcrumb.message
      };
      this._breadcrumbs.push(mergedBreadcrumb);
      if (this._breadcrumbs.length > maxCrumbs) {
        this._breadcrumbs = this._breadcrumbs.slice(-maxCrumbs);
        this._client?.recordDroppedEvent("buffer_overflow", "log_item");
      }
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Get the last breadcrumb of the scope.
     */
    getLastBreadcrumb() {
      return this._breadcrumbs[this._breadcrumbs.length - 1];
    }
    /**
     * Clear all breadcrumbs from the scope.
     */
    clearBreadcrumbs() {
      this._breadcrumbs = [];
      this._notifyScopeListeners();
      return this;
    }
    /**
     * Add an attachment to the scope.
     */
    addAttachment(attachment) {
      this._attachments.push(attachment);
      return this;
    }
    /**
     * Clear all attachments from the scope.
     */
    clearAttachments() {
      this._attachments = [];
      return this;
    }
    /**
     * Get the data of this scope, which should be applied to an event during processing.
     */
    getScopeData() {
      return {
        breadcrumbs: this._breadcrumbs,
        attachments: this._attachments,
        contexts: this._contexts,
        tags: this._tags,
        attributes: this._attributes,
        extra: this._extra,
        user: this._user,
        level: this._level,
        fingerprint: this._fingerprint || [],
        eventProcessors: this._eventProcessors,
        propagationContext: this._propagationContext,
        sdkProcessingMetadata: this._sdkProcessingMetadata,
        transactionName: this._transactionName,
        span: _getSpanForScope(this),
        conversationId: this._conversationId
      };
    }
    /**
     * Add data which will be accessible during event processing but won't get sent to Sentry.
     */
    setSDKProcessingMetadata(newData) {
      this._sdkProcessingMetadata = merge(this._sdkProcessingMetadata, newData, 2);
      return this;
    }
    /**
     * Add propagation context to the scope, used for distributed tracing
     */
    setPropagationContext(context) {
      this._propagationContext = context;
      return this;
    }
    /**
     * Get propagation context from the scope, used for distributed tracing
     */
    getPropagationContext() {
      return this._propagationContext;
    }
    /**
     * Capture an exception for this scope.
     *
     * @returns {string} The id of the captured Sentry event.
     */
    captureException(exception, hint) {
      const eventId = hint?.event_id || uuid4();
      if (!this._client) {
        DEBUG_BUILD && debug.warn("No client configured on scope - will not capture exception!");
        return eventId;
      }
      const syntheticException = new Error("Sentry syntheticException");
      this._client.captureException(
        exception,
        {
          originalException: exception,
          syntheticException,
          ...hint,
          event_id: eventId
        },
        this
      );
      return eventId;
    }
    /**
     * Capture a message for this scope.
     *
     * @returns {string} The id of the captured message.
     */
    captureMessage(message, level, hint) {
      const eventId = hint?.event_id || uuid4();
      if (!this._client) {
        DEBUG_BUILD && debug.warn("No client configured on scope - will not capture message!");
        return eventId;
      }
      const syntheticException = hint?.syntheticException ?? new Error(message);
      this._client.captureMessage(
        message,
        level,
        {
          originalException: message,
          syntheticException,
          ...hint,
          event_id: eventId
        },
        this
      );
      return eventId;
    }
    /**
     * Capture a Sentry event for this scope.
     *
     * @returns {string} The id of the captured event.
     */
    captureEvent(event, hint) {
      const eventId = event.event_id || hint?.event_id || uuid4();
      if (!this._client) {
        DEBUG_BUILD && debug.warn("No client configured on scope - will not capture event!");
        return eventId;
      }
      this._client.captureEvent(event, { ...hint, event_id: eventId }, this);
      return eventId;
    }
    /**
     * This will be called on every set call.
     */
    _notifyScopeListeners() {
      if (!this._notifyingListeners) {
        this._notifyingListeners = true;
        this._scopeListeners.forEach((callback) => {
          callback(this);
        });
        this._notifyingListeners = false;
      }
    }
  };

  // node_modules/@sentry/core/build/esm/defaultScopes.js
  function getDefaultCurrentScope() {
    return getGlobalSingleton("defaultCurrentScope", () => new Scope());
  }
  function getDefaultIsolationScope() {
    return getGlobalSingleton("defaultIsolationScope", () => new Scope());
  }

  // node_modules/@sentry/core/build/esm/utils/chain-and-copy-promiselike.js
  var isActualPromise = (p) => p instanceof Promise && !p[kChainedCopy];
  var kChainedCopy = Symbol("chained PromiseLike");
  var chainAndCopyPromiseLike = (original, onSuccess, onError) => {
    const chained = original.then(
      (value) => {
        onSuccess(value);
        return value;
      },
      (err) => {
        onError(err);
        throw err;
      }
    );
    return isActualPromise(chained) && isActualPromise(original) ? chained : copyProps(original, chained);
  };
  var copyProps = (original, chained) => {
    let mutated = false;
    for (const key in original) {
      if (key in chained) continue;
      mutated = true;
      const value = original[key];
      if (typeof value === "function") {
        Object.defineProperty(chained, key, {
          value: (...args) => value.apply(original, args),
          enumerable: true,
          configurable: true,
          writable: true
        });
      } else {
        chained[key] = value;
      }
    }
    if (mutated) Object.assign(chained, { [kChainedCopy]: true });
    return chained;
  };

  // node_modules/@sentry/core/build/esm/asyncContext/stackStrategy.js
  var AsyncContextStack = class {
    constructor(scope, isolationScope) {
      let assignedScope;
      if (!scope) {
        assignedScope = new Scope();
      } else {
        assignedScope = scope;
      }
      let assignedIsolationScope;
      if (!isolationScope) {
        assignedIsolationScope = new Scope();
      } else {
        assignedIsolationScope = isolationScope;
      }
      this._stack = [{ scope: assignedScope }];
      this._isolationScope = assignedIsolationScope;
    }
    /**
     * Fork a scope for the stack.
     */
    withScope(callback) {
      const scope = this._pushScope();
      let maybePromiseResult;
      try {
        maybePromiseResult = callback(scope);
      } catch (e) {
        this._popScope();
        throw e;
      }
      if (isThenable(maybePromiseResult)) {
        return chainAndCopyPromiseLike(
          maybePromiseResult,
          () => this._popScope(),
          () => this._popScope()
        );
      }
      this._popScope();
      return maybePromiseResult;
    }
    /**
     * Get the client of the stack.
     */
    getClient() {
      return this.getStackTop().client;
    }
    /**
     * Returns the scope of the top stack.
     */
    getScope() {
      return this.getStackTop().scope;
    }
    /**
     * Get the isolation scope for the stack.
     */
    getIsolationScope() {
      return this._isolationScope;
    }
    /**
     * Returns the topmost scope layer in the order domain > local > process.
     */
    getStackTop() {
      return this._stack[this._stack.length - 1];
    }
    /**
     * Push a scope to the stack.
     */
    _pushScope() {
      const scope = this.getScope().clone();
      this._stack.push({
        client: this.getClient(),
        scope
      });
      return scope;
    }
    /**
     * Pop a scope from the stack.
     */
    _popScope() {
      if (this._stack.length <= 1) return false;
      return !!this._stack.pop();
    }
  };
  function getAsyncContextStack() {
    const registry = getMainCarrier();
    const sentry = getSentryCarrier(registry);
    return sentry.stack = sentry.stack || new AsyncContextStack(getDefaultCurrentScope(), getDefaultIsolationScope());
  }
  function withScope(callback) {
    return getAsyncContextStack().withScope(callback);
  }
  function withSetScope(scope, callback) {
    const stack = getAsyncContextStack();
    return stack.withScope(() => {
      stack.getStackTop().scope = scope;
      return callback(scope);
    });
  }
  function withIsolationScope(callback) {
    return getAsyncContextStack().withScope(() => {
      return callback(getAsyncContextStack().getIsolationScope());
    });
  }
  function getStackAsyncContextStrategy() {
    return {
      withIsolationScope,
      withScope,
      withSetScope,
      withSetIsolationScope: (_isolationScope, callback) => {
        return withIsolationScope(callback);
      },
      getCurrentScope: () => getAsyncContextStack().getScope(),
      getIsolationScope: () => getAsyncContextStack().getIsolationScope()
    };
  }

  // node_modules/@sentry/core/build/esm/asyncContext/index.js
  function getAsyncContextStrategy(carrier) {
    const sentry = getSentryCarrier(carrier);
    if (sentry.acs) {
      return sentry.acs;
    }
    return getStackAsyncContextStrategy();
  }

  // node_modules/@sentry/core/build/esm/currentScopes.js
  var _externalPropagationContextProvider;
  function getExternalPropagationContext() {
    return _externalPropagationContextProvider?.();
  }
  function getCurrentScope() {
    const carrier = getMainCarrier();
    const acs = getAsyncContextStrategy(carrier);
    return acs.getCurrentScope();
  }
  function getIsolationScope() {
    const carrier = getMainCarrier();
    const acs = getAsyncContextStrategy(carrier);
    return acs.getIsolationScope();
  }
  function getGlobalScope() {
    return getGlobalSingleton("globalScope", () => new Scope());
  }
  function withScope2(...rest) {
    const carrier = getMainCarrier();
    const acs = getAsyncContextStrategy(carrier);
    if (rest.length === 2) {
      const [scope, callback] = rest;
      if (!scope) {
        return acs.withScope(callback);
      }
      return acs.withSetScope(scope, callback);
    }
    return acs.withScope(rest[0]);
  }
  function getClient() {
    return getCurrentScope().getClient();
  }
  function getTraceContextFromScope(scope) {
    const externalContext = getExternalPropagationContext();
    if (externalContext) {
      return { trace_id: externalContext.traceId, span_id: externalContext.spanId };
    }
    const propagationContext = scope.getPropagationContext();
    const { traceId, parentSpanId, propagationSpanId } = propagationContext;
    const traceContext = {
      trace_id: traceId,
      span_id: propagationSpanId || generateSpanId()
    };
    if (parentSpanId) {
      traceContext.parent_span_id = parentSpanId;
    }
    return traceContext;
  }

  // node_modules/@sentry/core/build/esm/semanticAttributes.js
  var SEMANTIC_ATTRIBUTE_SENTRY_SOURCE = "sentry.source";
  var SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE = "sentry.sample_rate";
  var SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE = "sentry.previous_trace_sample_rate";
  var SEMANTIC_ATTRIBUTE_SENTRY_OP = "sentry.op";
  var SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN = "sentry.origin";
  var SEMANTIC_ATTRIBUTE_PROFILE_ID = "sentry.profile_id";
  var SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME = "sentry.exclusive_time";
  var GEN_AI_CONVERSATION_ID_ATTRIBUTE = "gen_ai.conversation.id";

  // node_modules/@sentry/core/build/esm/tracing/spanstatus.js
  var SPAN_STATUS_UNSET = 0;
  var SPAN_STATUS_OK = 1;

  // node_modules/@sentry/core/build/esm/utils/weakRef.js
  function derefWeakRef(ref) {
    if (!ref) {
      return void 0;
    }
    if (typeof ref === "object" && "deref" in ref && typeof ref.deref === "function") {
      try {
        return ref.deref();
      } catch {
        return void 0;
      }
    }
    return ref;
  }

  // node_modules/@sentry/core/build/esm/tracing/utils.js
  var SCOPE_ON_START_SPAN_FIELD = "_sentryScope";
  var ISOLATION_SCOPE_ON_START_SPAN_FIELD = "_sentryIsolationScope";
  function getCapturedScopesOnSpan(span) {
    const spanWithScopes = span;
    return {
      scope: spanWithScopes[SCOPE_ON_START_SPAN_FIELD],
      isolationScope: derefWeakRef(spanWithScopes[ISOLATION_SCOPE_ON_START_SPAN_FIELD])
    };
  }

  // node_modules/@sentry/core/build/esm/utils/baggage.js
  var SENTRY_BAGGAGE_KEY_PREFIX = "sentry-";
  function baggageHeaderToDynamicSamplingContext(baggageHeader) {
    const baggageObject = parseBaggageHeader(baggageHeader);
    if (!baggageObject) {
      return void 0;
    }
    const dynamicSamplingContext = Object.entries(baggageObject).reduce((acc, [key, value]) => {
      if (key.startsWith(SENTRY_BAGGAGE_KEY_PREFIX)) {
        const nonPrefixedKey = key.slice(SENTRY_BAGGAGE_KEY_PREFIX.length);
        acc[nonPrefixedKey] = value;
      }
      return acc;
    }, {});
    if (Object.keys(dynamicSamplingContext).length > 0) {
      return dynamicSamplingContext;
    } else {
      return void 0;
    }
  }
  function parseBaggageHeader(baggageHeader) {
    if (!baggageHeader || !isString(baggageHeader) && !Array.isArray(baggageHeader)) {
      return void 0;
    }
    if (Array.isArray(baggageHeader)) {
      return baggageHeader.reduce((acc, curr) => {
        const currBaggageObject = baggageHeaderToObject(curr);
        Object.entries(currBaggageObject).forEach(([key, value]) => {
          acc[key] = value;
        });
        return acc;
      }, {});
    }
    return baggageHeaderToObject(baggageHeader);
  }
  function baggageHeaderToObject(baggageHeader) {
    return baggageHeader.split(",").map((baggageEntry) => {
      const eqIdx = baggageEntry.indexOf("=");
      if (eqIdx === -1) {
        return [];
      }
      const key = baggageEntry.slice(0, eqIdx);
      const value = baggageEntry.slice(eqIdx + 1);
      return [key, value].map((keyOrValue) => {
        try {
          return decodeURIComponent(keyOrValue.trim());
        } catch {
          return;
        }
      });
    }).reduce((acc, [key, value]) => {
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }

  // node_modules/@sentry/core/build/esm/utils/dsn.js
  var ORG_ID_REGEX = /^o(\d+)\./;
  var DSN_REGEX = /^(?:(\w+):)\/\/(?:(\w+)(?::(\w+)?)?@)((?:\[[:.%\w]+\]|[\w.-]+))(?::(\d+))?\/(.+)/;
  function isValidProtocol(protocol) {
    return protocol === "http" || protocol === "https";
  }
  function dsnToString(dsn, withPassword = false) {
    const { host, path, pass, port, projectId, protocol, publicKey } = dsn;
    return `${protocol}://${publicKey}${withPassword && pass ? `:${pass}` : ""}@${host}${port ? `:${port}` : ""}/${path ? `${path}/` : path}${projectId}`;
  }
  function dsnFromString(str) {
    const match = DSN_REGEX.exec(str);
    if (!match) {
      consoleSandbox(() => {
        console.error(`Invalid Sentry Dsn: ${str}`);
      });
      return void 0;
    }
    const [protocol, publicKey, pass = "", host = "", port = "", lastPath = ""] = match.slice(1);
    let path = "";
    let projectId = lastPath;
    const split = projectId.split("/");
    if (split.length > 1) {
      path = split.slice(0, -1).join("/");
      projectId = split.pop();
    }
    if (projectId) {
      const projectMatch = projectId.match(/^\d+/);
      if (projectMatch) {
        projectId = projectMatch[0];
      }
    }
    return dsnFromComponents({ host, pass, path, projectId, port, protocol, publicKey });
  }
  function dsnFromComponents(components) {
    return {
      protocol: components.protocol,
      publicKey: components.publicKey || "",
      pass: components.pass || "",
      host: components.host,
      port: components.port || "",
      path: components.path || "",
      projectId: components.projectId
    };
  }
  function validateDsn(dsn) {
    if (!DEBUG_BUILD) {
      return true;
    }
    const { port, projectId, protocol } = dsn;
    const requiredComponents = ["protocol", "publicKey", "host", "projectId"];
    const hasMissingRequiredComponent = requiredComponents.find((component) => {
      if (!dsn[component]) {
        debug.error(`Invalid Sentry Dsn: ${component} missing`);
        return true;
      }
      return false;
    });
    if (hasMissingRequiredComponent) {
      return false;
    }
    if (!projectId.match(/^\d+$/)) {
      debug.error(`Invalid Sentry Dsn: Invalid projectId ${projectId}`);
      return false;
    }
    if (!isValidProtocol(protocol)) {
      debug.error(`Invalid Sentry Dsn: Invalid protocol ${protocol}`);
      return false;
    }
    if (port && isNaN(parseInt(port, 10))) {
      debug.error(`Invalid Sentry Dsn: Invalid port ${port}`);
      return false;
    }
    return true;
  }
  function extractOrgIdFromDsnHost(host) {
    const match = host.match(ORG_ID_REGEX);
    return match?.[1];
  }
  function extractOrgIdFromClient(client) {
    const options = client.getOptions();
    const { host } = client.getDsn() || {};
    let org_id;
    if (options.orgId) {
      org_id = String(options.orgId);
    } else if (host) {
      org_id = extractOrgIdFromDsnHost(host);
    }
    return org_id;
  }
  function makeDsn(from) {
    const components = typeof from === "string" ? dsnFromString(from) : dsnFromComponents(from);
    if (!components || !validateDsn(components)) {
      return void 0;
    }
    return components;
  }

  // node_modules/@sentry/core/build/esm/utils/parseSampleRate.js
  function parseSampleRate(sampleRate) {
    if (typeof sampleRate === "boolean") {
      return Number(sampleRate);
    }
    const rate = typeof sampleRate === "string" ? parseFloat(sampleRate) : sampleRate;
    if (typeof rate !== "number" || isNaN(rate) || rate < 0 || rate > 1) {
      return void 0;
    }
    return rate;
  }

  // node_modules/@sentry/core/build/esm/utils/spanUtils.js
  var TRACE_FLAG_SAMPLED = 1;
  var hasShownSpanDropWarning = false;
  function spanToTraceContext(span) {
    const { spanId, traceId: trace_id, isRemote } = span.spanContext();
    const parent_span_id = isRemote ? spanId : spanToJSON(span).parent_span_id;
    const scope = getCapturedScopesOnSpan(span).scope;
    const span_id = isRemote ? scope?.getPropagationContext().propagationSpanId || generateSpanId() : spanId;
    return {
      parent_span_id,
      span_id,
      trace_id
    };
  }
  function convertSpanLinksForEnvelope(links) {
    if (links && links.length > 0) {
      return links.map(({ context: { spanId, traceId, traceFlags, ...restContext }, attributes }) => ({
        span_id: spanId,
        trace_id: traceId,
        sampled: traceFlags === TRACE_FLAG_SAMPLED,
        attributes,
        ...restContext
      }));
    } else {
      return void 0;
    }
  }
  function spanTimeInputToSeconds(input) {
    if (typeof input === "number") {
      return ensureTimestampInSeconds(input);
    }
    if (Array.isArray(input)) {
      return input[0] + input[1] / 1e9;
    }
    if (input instanceof Date) {
      return ensureTimestampInSeconds(input.getTime());
    }
    return timestampInSeconds();
  }
  function ensureTimestampInSeconds(timestamp) {
    const isMs = timestamp > 9999999999;
    return isMs ? timestamp / 1e3 : timestamp;
  }
  function spanToJSON(span) {
    if (spanIsSentrySpan(span)) {
      return span.getSpanJSON();
    }
    const { spanId: span_id, traceId: trace_id } = span.spanContext();
    if (spanIsOpenTelemetrySdkTraceBaseSpan(span)) {
      const { attributes, startTime, name, endTime, status, links } = span;
      return {
        span_id,
        trace_id,
        data: attributes,
        description: name,
        parent_span_id: getOtelParentSpanId(span),
        start_timestamp: spanTimeInputToSeconds(startTime),
        // This is [0,0] by default in OTEL, in which case we want to interpret this as no end time
        timestamp: spanTimeInputToSeconds(endTime) || void 0,
        status: getStatusMessage(status),
        op: attributes[SEMANTIC_ATTRIBUTE_SENTRY_OP],
        origin: attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],
        links: convertSpanLinksForEnvelope(links)
      };
    }
    return {
      span_id,
      trace_id,
      start_timestamp: 0,
      data: {}
    };
  }
  function getOtelParentSpanId(span) {
    return "parentSpanId" in span ? span.parentSpanId : "parentSpanContext" in span ? span.parentSpanContext?.spanId : void 0;
  }
  function spanIsOpenTelemetrySdkTraceBaseSpan(span) {
    const castSpan = span;
    return !!castSpan.attributes && !!castSpan.startTime && !!castSpan.name && !!castSpan.endTime && !!castSpan.status;
  }
  function spanIsSentrySpan(span) {
    return typeof span.getSpanJSON === "function";
  }
  function spanIsSampled(span) {
    const { traceFlags } = span.spanContext();
    return traceFlags === TRACE_FLAG_SAMPLED;
  }
  function getStatusMessage(status) {
    if (!status || status.code === SPAN_STATUS_UNSET) {
      return void 0;
    }
    if (status.code === SPAN_STATUS_OK) {
      return "ok";
    }
    return status.message || "internal_error";
  }
  var ROOT_SPAN_FIELD = "_sentryRootSpan";
  var getRootSpan = INTERNAL_getSegmentSpan;
  function INTERNAL_getSegmentSpan(span) {
    return span[ROOT_SPAN_FIELD] || span;
  }
  function showSpanDropWarning() {
    if (!hasShownSpanDropWarning) {
      consoleSandbox(() => {
        console.warn(
          "[Sentry] Returning null from `beforeSendSpan` is disallowed. To drop certain spans, configure the respective integrations directly or use `ignoreSpans`."
        );
      });
      hasShownSpanDropWarning = true;
    }
  }

  // node_modules/@sentry/core/build/esm/utils/hasSpansEnabled.js
  function hasSpansEnabled(maybeOptions) {
    if (typeof __SENTRY_TRACING__ === "boolean" && !__SENTRY_TRACING__) {
      return false;
    }
    const options = maybeOptions || getClient()?.getOptions();
    return !!options && // Note: This check is `!= null`, meaning "nullish". `0` is not "nullish", `undefined` and `null` are. (This comment was brought to you by 15 minutes of questioning life)
    (options.tracesSampleRate != null || !!options.tracesSampler);
  }

  // node_modules/@sentry/core/build/esm/utils/should-ignore-span.js
  function logIgnoredSpan(droppedSpan) {
    debug.log(`Ignoring span ${droppedSpan.op} - ${droppedSpan.description} because it matches \`ignoreSpans\`.`);
  }
  function shouldIgnoreSpan(span, ignoreSpans) {
    if (!ignoreSpans?.length || !span.description) {
      return false;
    }
    for (const pattern of ignoreSpans) {
      if (isStringOrRegExp(pattern)) {
        if (isMatchingPattern(span.description, pattern)) {
          DEBUG_BUILD && logIgnoredSpan(span);
          return true;
        }
        continue;
      }
      if (!pattern.name && !pattern.op) {
        continue;
      }
      const nameMatches = pattern.name ? isMatchingPattern(span.description, pattern.name) : true;
      const opMatches = pattern.op ? span.op && isMatchingPattern(span.op, pattern.op) : true;
      if (nameMatches && opMatches) {
        DEBUG_BUILD && logIgnoredSpan(span);
        return true;
      }
    }
    return false;
  }
  function reparentChildSpans(spans, dropSpan) {
    const droppedSpanParentId = dropSpan.parent_span_id;
    const droppedSpanId = dropSpan.span_id;
    if (!droppedSpanParentId) {
      return;
    }
    for (const span of spans) {
      if (span.parent_span_id === droppedSpanId) {
        span.parent_span_id = droppedSpanParentId;
      }
    }
  }
  function isStringOrRegExp(value) {
    return typeof value === "string" || value instanceof RegExp;
  }

  // node_modules/@sentry/core/build/esm/constants.js
  var DEFAULT_ENVIRONMENT = "production";

  // node_modules/@sentry/core/build/esm/tracing/dynamicSamplingContext.js
  var FROZEN_DSC_FIELD = "_frozenDsc";
  function getDynamicSamplingContextFromClient(trace_id, client) {
    const options = client.getOptions();
    const { publicKey: public_key } = client.getDsn() || {};
    const dsc = {
      environment: options.environment || DEFAULT_ENVIRONMENT,
      release: options.release,
      public_key,
      trace_id,
      org_id: extractOrgIdFromClient(client)
    };
    client.emit("createDsc", dsc);
    return dsc;
  }
  function getDynamicSamplingContextFromScope(client, scope) {
    const propagationContext = scope.getPropagationContext();
    return propagationContext.dsc || getDynamicSamplingContextFromClient(propagationContext.traceId, client);
  }
  function getDynamicSamplingContextFromSpan(span) {
    const client = getClient();
    if (!client) {
      return {};
    }
    const rootSpan = getRootSpan(span);
    const rootSpanJson = spanToJSON(rootSpan);
    const rootSpanAttributes = rootSpanJson.data;
    const traceState = rootSpan.spanContext().traceState;
    const rootSpanSampleRate = traceState?.get("sentry.sample_rate") ?? rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE] ?? rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_PREVIOUS_TRACE_SAMPLE_RATE];
    function applyLocalSampleRateToDsc(dsc2) {
      if (typeof rootSpanSampleRate === "number" || typeof rootSpanSampleRate === "string") {
        dsc2.sample_rate = `${rootSpanSampleRate}`;
      }
      return dsc2;
    }
    const frozenDsc = rootSpan[FROZEN_DSC_FIELD];
    if (frozenDsc) {
      return applyLocalSampleRateToDsc(frozenDsc);
    }
    const traceStateDsc = traceState?.get("sentry.dsc");
    const dscOnTraceState = traceStateDsc && baggageHeaderToDynamicSamplingContext(traceStateDsc);
    if (dscOnTraceState) {
      return applyLocalSampleRateToDsc(dscOnTraceState);
    }
    const dsc = getDynamicSamplingContextFromClient(span.spanContext().traceId, client);
    const source = rootSpanAttributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE] ?? rootSpanAttributes["sentry.span.source"];
    const name = rootSpanJson.description;
    if (source !== "url" && name) {
      dsc.transaction = name;
    }
    if (hasSpansEnabled()) {
      dsc.sampled = String(spanIsSampled(rootSpan));
      dsc.sample_rand = // In OTEL we store the sample rand on the trace state because we cannot access scopes for NonRecordingSpans
      // The Sentry OTEL SpanSampler takes care of writing the sample rand on the root span
      traceState?.get("sentry.sample_rand") ?? // On all other platforms we can actually get the scopes from a root span (we use this as a fallback)
      getCapturedScopesOnSpan(rootSpan).scope?.getPropagationContext().sampleRand.toString();
    }
    applyLocalSampleRateToDsc(dsc);
    client.emit("createDsc", dsc, rootSpan);
    return dsc;
  }

  // node_modules/@sentry/core/build/esm/tracing/spans/beforeSendSpan.js
  function isStreamedBeforeSendSpanCallback(callback) {
    return !!callback && typeof callback === "function" && "_streamed" in callback && !!callback._streamed;
  }

  // node_modules/@sentry/core/build/esm/utils/normalize.js
  function normalize(input, depth = 100, maxProperties = Infinity) {
    try {
      return visit("", input, depth, maxProperties);
    } catch (err) {
      return { ERROR: `**non-serializable** (${err})` };
    }
  }
  function normalizeToSize(object, depth = 3, maxSize = 100 * 1024) {
    const normalized = normalize(object, depth);
    if (jsonSize(normalized) > maxSize) {
      return normalizeToSize(object, depth - 1, maxSize);
    }
    return normalized;
  }
  function visit(key, value, depth = Infinity, maxProperties = Infinity, memo = memoBuilder()) {
    const [memoize, unmemoize] = memo;
    if (value == null || // this matches null and undefined -> eqeq not eqeqeq
    ["boolean", "string"].includes(typeof value) || typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    const stringified = stringifyValue(key, value);
    if (!stringified.startsWith("[object ")) {
      return stringified;
    }
    if (value["__sentry_skip_normalization__"]) {
      return value;
    }
    const remainingDepth = typeof value["__sentry_override_normalization_depth__"] === "number" ? value["__sentry_override_normalization_depth__"] : depth;
    if (remainingDepth === 0) {
      return stringified.replace("object ", "");
    }
    if (memoize(value)) {
      return "[Circular ~]";
    }
    const valueWithToJSON = value;
    if (valueWithToJSON && typeof valueWithToJSON.toJSON === "function") {
      try {
        const jsonValue = valueWithToJSON.toJSON();
        return visit("", jsonValue, remainingDepth - 1, maxProperties, memo);
      } catch {
      }
    }
    const normalized = Array.isArray(value) ? [] : {};
    let numAdded = 0;
    const visitable = convertToPlainObject(value);
    for (const visitKey in visitable) {
      if (!Object.prototype.hasOwnProperty.call(visitable, visitKey)) {
        continue;
      }
      if (numAdded >= maxProperties) {
        normalized[visitKey] = "[MaxProperties ~]";
        break;
      }
      const visitValue = visitable[visitKey];
      normalized[visitKey] = visit(visitKey, visitValue, remainingDepth - 1, maxProperties, memo);
      numAdded++;
    }
    unmemoize(value);
    return normalized;
  }
  function stringifyValue(key, value) {
    try {
      if (key === "domain" && value && typeof value === "object" && value._events) {
        return "[Domain]";
      }
      if (key === "domainEmitter") {
        return "[DomainEmitter]";
      }
      if (typeof global !== "undefined" && value === global) {
        return "[Global]";
      }
      if (typeof window !== "undefined" && value === window) {
        return "[Window]";
      }
      if (typeof document !== "undefined" && value === document) {
        return "[Document]";
      }
      if (isVueViewModel(value)) {
        return getVueInternalName(value);
      }
      if (isSyntheticEvent(value)) {
        return "[SyntheticEvent]";
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        return `[${value}]`;
      }
      if (typeof value === "function") {
        return `[Function: ${getFunctionName(value)}]`;
      }
      if (typeof value === "symbol") {
        return `[${String(value)}]`;
      }
      if (typeof value === "bigint") {
        return `[BigInt: ${String(value)}]`;
      }
      const objName = getConstructorName(value);
      if (/^HTML(\w*)Element$/.test(objName)) {
        return `[HTMLElement: ${objName}]`;
      }
      return `[object ${objName}]`;
    } catch (err) {
      return `**non-serializable** (${err})`;
    }
  }
  function getConstructorName(value) {
    const prototype = Object.getPrototypeOf(value);
    return prototype?.constructor ? prototype.constructor.name : "null prototype";
  }
  function utf8Length(value) {
    return ~-encodeURI(value).split(/%..|./).length;
  }
  function jsonSize(value) {
    return utf8Length(JSON.stringify(value));
  }
  function memoBuilder() {
    const inner = /* @__PURE__ */ new WeakSet();
    function memoize(obj) {
      if (inner.has(obj)) {
        return true;
      }
      inner.add(obj);
      return false;
    }
    function unmemoize(obj) {
      inner.delete(obj);
    }
    return [memoize, unmemoize];
  }

  // node_modules/@sentry/core/build/esm/utils/envelope.js
  function createEnvelope(headers, items = []) {
    return [headers, items];
  }
  function addItemToEnvelope(envelope, newItem) {
    const [headers, items] = envelope;
    return [headers, [...items, newItem]];
  }
  function forEachEnvelopeItem(envelope, callback) {
    const envelopeItems = envelope[1];
    for (const envelopeItem of envelopeItems) {
      const envelopeItemType = envelopeItem[0].type;
      const result = callback(envelopeItem, envelopeItemType);
      if (result) {
        return true;
      }
    }
    return false;
  }
  function envelopeContainsItemType(envelope, types) {
    return forEachEnvelopeItem(envelope, (_, type) => types.includes(type));
  }
  function encodeUTF8(input) {
    const carrier = getSentryCarrier(GLOBAL_OBJ);
    return carrier.encodePolyfill ? carrier.encodePolyfill(input) : new TextEncoder().encode(input);
  }
  function serializeEnvelope(envelope) {
    const [envHeaders, items] = envelope;
    let parts = JSON.stringify(envHeaders);
    function append(next) {
      if (typeof parts === "string") {
        parts = typeof next === "string" ? parts + next : [encodeUTF8(parts), next];
      } else {
        parts.push(typeof next === "string" ? encodeUTF8(next) : next);
      }
    }
    for (const item of items) {
      const [itemHeaders, payload] = item;
      append(`
${JSON.stringify(itemHeaders)}
`);
      if (typeof payload === "string" || payload instanceof Uint8Array) {
        append(payload);
      } else {
        let stringifiedPayload;
        try {
          stringifiedPayload = JSON.stringify(payload);
        } catch {
          stringifiedPayload = JSON.stringify(normalize(payload));
        }
        append(stringifiedPayload);
      }
    }
    return typeof parts === "string" ? parts : concatBuffers(parts);
  }
  function concatBuffers(buffers) {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of buffers) {
      merged.set(buffer, offset);
      offset += buffer.length;
    }
    return merged;
  }
  function createAttachmentEnvelopeItem(attachment) {
    const buffer = typeof attachment.data === "string" ? encodeUTF8(attachment.data) : attachment.data;
    return [
      {
        type: "attachment",
        length: buffer.length,
        filename: attachment.filename,
        content_type: attachment.contentType,
        attachment_type: attachment.attachmentType
      },
      buffer
    ];
  }
  var DATA_CATEGORY_OVERRIDES = {
    sessions: "session",
    event: "error",
    client_report: "internal",
    user_report: "default",
    profile_chunk: "profile",
    replay_event: "replay",
    replay_recording: "replay",
    check_in: "monitor",
    raw_security: "security",
    log: "log_item",
    trace_metric: "metric"
  };
  function _isOverriddenType(type) {
    return type in DATA_CATEGORY_OVERRIDES;
  }
  function envelopeItemTypeToDataCategory(type) {
    return _isOverriddenType(type) ? DATA_CATEGORY_OVERRIDES[type] : type;
  }
  function getSdkMetadataForEnvelopeHeader(metadataOrEvent) {
    if (!metadataOrEvent?.sdk) {
      return;
    }
    const { name, version } = metadataOrEvent.sdk;
    return { name, version };
  }
  function createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn) {
    const dynamicSamplingContext = event.sdkProcessingMetadata?.dynamicSamplingContext;
    return {
      event_id: event.event_id,
      sent_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...sdkInfo && { sdk: sdkInfo },
      ...!!tunnel && dsn && { dsn: dsnToString(dsn) },
      ...dynamicSamplingContext && {
        trace: dynamicSamplingContext
      }
    };
  }

  // node_modules/@sentry/core/build/esm/envelope.js
  function _enhanceEventWithSdkInfo(event, newSdkInfo) {
    if (!newSdkInfo) {
      return event;
    }
    const eventSdkInfo = event.sdk || {};
    event.sdk = {
      ...eventSdkInfo,
      name: eventSdkInfo.name || newSdkInfo.name,
      version: eventSdkInfo.version || newSdkInfo.version,
      integrations: [...event.sdk?.integrations || [], ...newSdkInfo.integrations || []],
      packages: [...event.sdk?.packages || [], ...newSdkInfo.packages || []],
      settings: event.sdk?.settings || newSdkInfo.settings ? {
        ...event.sdk?.settings,
        ...newSdkInfo.settings
      } : void 0
    };
    return event;
  }
  function createSessionEnvelope(session, dsn, metadata, tunnel) {
    const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
    const envelopeHeaders = {
      sent_at: (/* @__PURE__ */ new Date()).toISOString(),
      ...sdkInfo && { sdk: sdkInfo },
      ...!!tunnel && dsn && { dsn: dsnToString(dsn) }
    };
    const envelopeItem = "aggregates" in session ? [{ type: "sessions" }, session] : [{ type: "session" }, session.toJSON()];
    return createEnvelope(envelopeHeaders, [envelopeItem]);
  }
  function createEventEnvelope(event, dsn, metadata, tunnel) {
    const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
    const eventType = event.type && event.type !== "replay_event" ? event.type : "event";
    _enhanceEventWithSdkInfo(event, metadata?.sdk);
    const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
    delete event.sdkProcessingMetadata;
    const eventItem = [{ type: eventType }, event];
    return createEnvelope(envelopeHeaders, [eventItem]);
  }

  // node_modules/@sentry/core/build/esm/utils/scopeData.js
  function applyScopeDataToEvent(event, data) {
    const { fingerprint, span, breadcrumbs, sdkProcessingMetadata } = data;
    applyDataToEvent(event, data);
    if (span) {
      applySpanToEvent(event, span);
    }
    applyFingerprintToEvent(event, fingerprint);
    applyBreadcrumbsToEvent(event, breadcrumbs);
    applySdkMetadataToEvent(event, sdkProcessingMetadata);
  }
  function mergeScopeData(data, mergeData) {
    const {
      extra,
      tags,
      attributes,
      user,
      contexts,
      level,
      sdkProcessingMetadata,
      breadcrumbs,
      fingerprint,
      eventProcessors,
      attachments,
      propagationContext,
      transactionName,
      span
    } = mergeData;
    mergeAndOverwriteScopeData(data, "extra", extra);
    mergeAndOverwriteScopeData(data, "tags", tags);
    mergeAndOverwriteScopeData(data, "attributes", attributes);
    mergeAndOverwriteScopeData(data, "user", user);
    mergeAndOverwriteScopeData(data, "contexts", contexts);
    data.sdkProcessingMetadata = merge(data.sdkProcessingMetadata, sdkProcessingMetadata, 2);
    if (level) {
      data.level = level;
    }
    if (transactionName) {
      data.transactionName = transactionName;
    }
    if (span) {
      data.span = span;
    }
    if (breadcrumbs.length) {
      data.breadcrumbs = [...data.breadcrumbs, ...breadcrumbs];
    }
    if (fingerprint.length) {
      data.fingerprint = [...data.fingerprint, ...fingerprint];
    }
    if (eventProcessors.length) {
      data.eventProcessors = [...data.eventProcessors, ...eventProcessors];
    }
    if (attachments.length) {
      data.attachments = [...data.attachments, ...attachments];
    }
    data.propagationContext = { ...data.propagationContext, ...propagationContext };
  }
  function mergeAndOverwriteScopeData(data, prop, mergeVal) {
    data[prop] = merge(data[prop], mergeVal, 1);
  }
  function getCombinedScopeData(isolationScope, currentScope) {
    const scopeData = getGlobalScope().getScopeData();
    isolationScope && mergeScopeData(scopeData, isolationScope.getScopeData());
    currentScope && mergeScopeData(scopeData, currentScope.getScopeData());
    return scopeData;
  }
  function applyDataToEvent(event, data) {
    const { extra, tags, user, contexts, level, transactionName } = data;
    if (Object.keys(extra).length) {
      event.extra = { ...extra, ...event.extra };
    }
    if (Object.keys(tags).length) {
      event.tags = { ...tags, ...event.tags };
    }
    if (Object.keys(user).length) {
      event.user = { ...user, ...event.user };
    }
    if (Object.keys(contexts).length) {
      event.contexts = { ...contexts, ...event.contexts };
    }
    if (level) {
      event.level = level;
    }
    if (transactionName && event.type !== "transaction") {
      event.transaction = transactionName;
    }
  }
  function applyBreadcrumbsToEvent(event, breadcrumbs) {
    const mergedBreadcrumbs = [...event.breadcrumbs || [], ...breadcrumbs];
    event.breadcrumbs = mergedBreadcrumbs.length ? mergedBreadcrumbs : void 0;
  }
  function applySdkMetadataToEvent(event, sdkProcessingMetadata) {
    event.sdkProcessingMetadata = {
      ...event.sdkProcessingMetadata,
      ...sdkProcessingMetadata
    };
  }
  function applySpanToEvent(event, span) {
    event.contexts = {
      trace: spanToTraceContext(span),
      ...event.contexts
    };
    event.sdkProcessingMetadata = {
      dynamicSamplingContext: getDynamicSamplingContextFromSpan(span),
      ...event.sdkProcessingMetadata
    };
    const rootSpan = getRootSpan(span);
    const transactionName = spanToJSON(rootSpan).description;
    if (transactionName && !event.transaction && event.type === "transaction") {
      event.transaction = transactionName;
    }
  }
  function applyFingerprintToEvent(event, fingerprint) {
    event.fingerprint = event.fingerprint ? Array.isArray(event.fingerprint) ? event.fingerprint : [event.fingerprint] : [];
    if (fingerprint) {
      event.fingerprint = event.fingerprint.concat(fingerprint);
    }
    if (!event.fingerprint.length) {
      delete event.fingerprint;
    }
  }

  // node_modules/@sentry/core/build/esm/utils/syncpromise.js
  var STATE_PENDING = 0;
  var STATE_RESOLVED = 1;
  var STATE_REJECTED = 2;
  function resolvedSyncPromise(value) {
    return new SyncPromise((resolve) => {
      resolve(value);
    });
  }
  function rejectedSyncPromise(reason) {
    return new SyncPromise((_, reject) => {
      reject(reason);
    });
  }
  var SyncPromise = class _SyncPromise {
    constructor(executor) {
      this._state = STATE_PENDING;
      this._handlers = [];
      this._runExecutor(executor);
    }
    /** @inheritdoc */
    then(onfulfilled, onrejected) {
      return new _SyncPromise((resolve, reject) => {
        this._handlers.push([
          false,
          (result) => {
            if (!onfulfilled) {
              resolve(result);
            } else {
              try {
                resolve(onfulfilled(result));
              } catch (e) {
                reject(e);
              }
            }
          },
          (reason) => {
            if (!onrejected) {
              reject(reason);
            } else {
              try {
                resolve(onrejected(reason));
              } catch (e) {
                reject(e);
              }
            }
          }
        ]);
        this._executeHandlers();
      });
    }
    /** @inheritdoc */
    catch(onrejected) {
      return this.then((val) => val, onrejected);
    }
    /** @inheritdoc */
    finally(onfinally) {
      return new _SyncPromise((resolve, reject) => {
        let val;
        let isRejected;
        return this.then(
          (value) => {
            isRejected = false;
            val = value;
            if (onfinally) {
              onfinally();
            }
          },
          (reason) => {
            isRejected = true;
            val = reason;
            if (onfinally) {
              onfinally();
            }
          }
        ).then(() => {
          if (isRejected) {
            reject(val);
            return;
          }
          resolve(val);
        });
      });
    }
    /** Excute the resolve/reject handlers. */
    _executeHandlers() {
      if (this._state === STATE_PENDING) {
        return;
      }
      const cachedHandlers = this._handlers.slice();
      this._handlers = [];
      cachedHandlers.forEach((handler) => {
        if (handler[0]) {
          return;
        }
        if (this._state === STATE_RESOLVED) {
          handler[1](this._value);
        }
        if (this._state === STATE_REJECTED) {
          handler[2](this._value);
        }
        handler[0] = true;
      });
    }
    /** Run the executor for the SyncPromise. */
    _runExecutor(executor) {
      const setResult = (state, value) => {
        if (this._state !== STATE_PENDING) {
          return;
        }
        if (isThenable(value)) {
          void value.then(resolve, reject);
          return;
        }
        this._state = state;
        this._value = value;
        this._executeHandlers();
      };
      const resolve = (value) => {
        setResult(STATE_RESOLVED, value);
      };
      const reject = (reason) => {
        setResult(STATE_REJECTED, reason);
      };
      try {
        executor(resolve, reject);
      } catch (e) {
        reject(e);
      }
    }
  };

  // node_modules/@sentry/core/build/esm/eventProcessors.js
  function notifyEventProcessors(processors, event, hint, index = 0) {
    try {
      const result = _notifyEventProcessors(event, hint, processors, index);
      return isThenable(result) ? result : resolvedSyncPromise(result);
    } catch (error2) {
      return rejectedSyncPromise(error2);
    }
  }
  function _notifyEventProcessors(event, hint, processors, index) {
    const processor = processors[index];
    if (!event || !processor) {
      return event;
    }
    const result = processor({ ...event }, hint);
    DEBUG_BUILD && result === null && debug.log(`Event processor "${processor.id || "?"}" dropped event`);
    if (isThenable(result)) {
      return result.then((final) => _notifyEventProcessors(final, hint, processors, index + 1));
    }
    return _notifyEventProcessors(result, hint, processors, index + 1);
  }

  // node_modules/@sentry/core/build/esm/utils/debug-ids.js
  var parsedStackResults;
  var lastSentryKeysCount;
  var lastNativeKeysCount;
  var cachedFilenameDebugIds;
  function getFilenameToDebugIdMap(stackParser) {
    const sentryDebugIdMap = GLOBAL_OBJ._sentryDebugIds;
    const nativeDebugIdMap = GLOBAL_OBJ._debugIds;
    if (!sentryDebugIdMap && !nativeDebugIdMap) {
      return {};
    }
    const sentryDebugIdKeys = sentryDebugIdMap ? Object.keys(sentryDebugIdMap) : [];
    const nativeDebugIdKeys = nativeDebugIdMap ? Object.keys(nativeDebugIdMap) : [];
    if (cachedFilenameDebugIds && sentryDebugIdKeys.length === lastSentryKeysCount && nativeDebugIdKeys.length === lastNativeKeysCount) {
      return cachedFilenameDebugIds;
    }
    lastSentryKeysCount = sentryDebugIdKeys.length;
    lastNativeKeysCount = nativeDebugIdKeys.length;
    cachedFilenameDebugIds = {};
    if (!parsedStackResults) {
      parsedStackResults = {};
    }
    const processDebugIds = (debugIdKeys, debugIdMap) => {
      for (const key of debugIdKeys) {
        const debugId = debugIdMap[key];
        const result = parsedStackResults?.[key];
        if (result && cachedFilenameDebugIds && debugId) {
          cachedFilenameDebugIds[result[0]] = debugId;
          if (parsedStackResults) {
            parsedStackResults[key] = [result[0], debugId];
          }
        } else if (debugId) {
          const parsedStack = stackParser(key);
          for (let i = parsedStack.length - 1; i >= 0; i--) {
            const stackFrame = parsedStack[i];
            const filename = stackFrame?.filename;
            if (filename && cachedFilenameDebugIds && parsedStackResults) {
              cachedFilenameDebugIds[filename] = debugId;
              parsedStackResults[key] = [filename, debugId];
              break;
            }
          }
        }
      }
    };
    if (sentryDebugIdMap) {
      processDebugIds(sentryDebugIdKeys, sentryDebugIdMap);
    }
    if (nativeDebugIdMap) {
      processDebugIds(nativeDebugIdKeys, nativeDebugIdMap);
    }
    return cachedFilenameDebugIds;
  }

  // node_modules/@sentry/core/build/esm/utils/prepareEvent.js
  function prepareEvent(options, event, hint, scope, client, isolationScope) {
    const { normalizeDepth = 3, normalizeMaxBreadth = 1e3 } = options;
    const prepared = {
      ...event,
      event_id: event.event_id || hint.event_id || uuid4(),
      timestamp: event.timestamp || dateTimestampInSeconds()
    };
    const integrations = hint.integrations || options.integrations.map((i) => i.name);
    applyClientOptions(prepared, options);
    applyIntegrationsMetadata(prepared, integrations);
    if (client) {
      client.emit("applyFrameMetadata", event);
    }
    if (event.type === void 0) {
      applyDebugIds(prepared, options.stackParser);
    }
    const finalScope = getFinalScope(scope, hint.captureContext);
    if (hint.mechanism) {
      addExceptionMechanism(prepared, hint.mechanism);
    }
    const clientEventProcessors = client ? client.getEventProcessors() : [];
    const data = getCombinedScopeData(isolationScope, finalScope);
    const attachments = [...hint.attachments || [], ...data.attachments];
    if (attachments.length) {
      hint.attachments = attachments;
    }
    applyScopeDataToEvent(prepared, data);
    const eventProcessors = [
      ...clientEventProcessors,
      // Run scope event processors _after_ all other processors
      ...data.eventProcessors
    ];
    const isInternalException = hint.data && hint.data.__sentry__ === true;
    const result = isInternalException ? resolvedSyncPromise(prepared) : notifyEventProcessors(eventProcessors, prepared, hint);
    return result.then((evt) => {
      if (evt) {
        applyDebugMeta(evt);
      }
      if (typeof normalizeDepth === "number" && normalizeDepth > 0) {
        return normalizeEvent(evt, normalizeDepth, normalizeMaxBreadth);
      }
      return evt;
    });
  }
  function applyClientOptions(event, options) {
    const { environment, release, dist, maxValueLength } = options;
    event.environment = event.environment || environment || DEFAULT_ENVIRONMENT;
    if (!event.release && release) {
      event.release = release;
    }
    if (!event.dist && dist) {
      event.dist = dist;
    }
    const request = event.request;
    if (request?.url && maxValueLength) {
      request.url = truncate(request.url, maxValueLength);
    }
    if (maxValueLength) {
      event.exception?.values?.forEach((exception) => {
        if (exception.value) {
          exception.value = truncate(exception.value, maxValueLength);
        }
      });
    }
  }
  function applyDebugIds(event, stackParser) {
    const filenameDebugIdMap = getFilenameToDebugIdMap(stackParser);
    event.exception?.values?.forEach((exception) => {
      exception.stacktrace?.frames?.forEach((frame) => {
        if (frame.filename) {
          frame.debug_id = filenameDebugIdMap[frame.filename];
        }
      });
    });
  }
  function applyDebugMeta(event) {
    const filenameDebugIdMap = {};
    event.exception?.values?.forEach((exception) => {
      exception.stacktrace?.frames?.forEach((frame) => {
        if (frame.debug_id) {
          if (frame.abs_path) {
            filenameDebugIdMap[frame.abs_path] = frame.debug_id;
          } else if (frame.filename) {
            filenameDebugIdMap[frame.filename] = frame.debug_id;
          }
          delete frame.debug_id;
        }
      });
    });
    if (Object.keys(filenameDebugIdMap).length === 0) {
      return;
    }
    event.debug_meta = event.debug_meta || {};
    event.debug_meta.images = event.debug_meta.images || [];
    const images = event.debug_meta.images;
    Object.entries(filenameDebugIdMap).forEach(([filename, debug_id]) => {
      images.push({
        type: "sourcemap",
        code_file: filename,
        debug_id
      });
    });
  }
  function applyIntegrationsMetadata(event, integrationNames) {
    if (integrationNames.length > 0) {
      event.sdk = event.sdk || {};
      event.sdk.integrations = [...event.sdk.integrations || [], ...integrationNames];
    }
  }
  function normalizeEvent(event, depth, maxBreadth) {
    if (!event) {
      return null;
    }
    const normalized = {
      ...event,
      ...event.breadcrumbs && {
        breadcrumbs: event.breadcrumbs.map((b) => ({
          ...b,
          ...b.data && {
            data: normalize(b.data, depth, maxBreadth)
          }
        }))
      },
      ...event.user && {
        user: normalize(event.user, depth, maxBreadth)
      },
      ...event.contexts && {
        contexts: normalize(event.contexts, depth, maxBreadth)
      },
      ...event.extra && {
        extra: normalize(event.extra, depth, maxBreadth)
      }
    };
    if (event.contexts?.trace && normalized.contexts) {
      normalized.contexts.trace = event.contexts.trace;
      if (event.contexts.trace.data) {
        normalized.contexts.trace.data = normalize(event.contexts.trace.data, depth, maxBreadth);
      }
    }
    if (event.spans) {
      normalized.spans = event.spans.map((span) => {
        return {
          ...span,
          ...span.data && {
            data: normalize(span.data, depth, maxBreadth)
          }
        };
      });
    }
    if (event.contexts?.flags && normalized.contexts) {
      normalized.contexts.flags = normalize(event.contexts.flags, 3, maxBreadth);
    }
    return normalized;
  }
  function getFinalScope(scope, captureContext) {
    if (!captureContext) {
      return scope;
    }
    const finalScope = scope ? scope.clone() : new Scope();
    finalScope.update(captureContext);
    return finalScope;
  }
  function parseEventHintOrCaptureContext(hint) {
    if (!hint) {
      return void 0;
    }
    if (hintIsScopeOrFunction(hint)) {
      return { captureContext: hint };
    }
    if (hintIsScopeContext(hint)) {
      return {
        captureContext: hint
      };
    }
    return hint;
  }
  function hintIsScopeOrFunction(hint) {
    return hint instanceof Scope || typeof hint === "function";
  }
  var captureContextKeys = [
    "user",
    "level",
    "extra",
    "contexts",
    "tags",
    "fingerprint",
    "propagationContext"
  ];
  function hintIsScopeContext(hint) {
    return Object.keys(hint).some((key) => captureContextKeys.includes(key));
  }

  // node_modules/@sentry/core/build/esm/exports.js
  function captureException(exception, hint) {
    return getCurrentScope().captureException(exception, parseEventHintOrCaptureContext(hint));
  }
  function captureEvent(event, hint) {
    return getCurrentScope().captureEvent(event, hint);
  }
  function setUser(user) {
    getIsolationScope().setUser(user);
  }
  function startSession(context) {
    const isolationScope = getIsolationScope();
    const { user } = getCombinedScopeData(isolationScope, getCurrentScope());
    const { userAgent } = GLOBAL_OBJ.navigator || {};
    const session = makeSession({
      user,
      ...userAgent && { userAgent },
      ...context
    });
    const currentSession = isolationScope.getSession();
    if (currentSession?.status === "ok") {
      updateSession(currentSession, { status: "exited" });
    }
    endSession();
    isolationScope.setSession(session);
    return session;
  }
  function endSession() {
    const isolationScope = getIsolationScope();
    const currentScope = getCurrentScope();
    const session = currentScope.getSession() || isolationScope.getSession();
    if (session) {
      closeSession(session);
    }
    _sendSessionUpdate();
    isolationScope.setSession();
  }
  function _sendSessionUpdate() {
    const isolationScope = getIsolationScope();
    const client = getClient();
    const session = isolationScope.getSession();
    if (session && client) {
      client.captureSession(session);
    }
  }
  function captureSession(end = false) {
    if (end) {
      endSession();
      return;
    }
    _sendSessionUpdate();
  }

  // node_modules/@sentry/core/build/esm/api.js
  var SENTRY_API_VERSION = "7";
  function getBaseApiEndpoint(dsn) {
    const protocol = dsn.protocol ? `${dsn.protocol}:` : "";
    const port = dsn.port ? `:${dsn.port}` : "";
    return `${protocol}//${dsn.host}${port}${dsn.path ? `/${dsn.path}` : ""}/api/`;
  }
  function _getIngestEndpoint(dsn) {
    return `${getBaseApiEndpoint(dsn)}${dsn.projectId}/envelope/`;
  }
  function _encodedAuth(dsn, sdkInfo) {
    const params = {
      sentry_version: SENTRY_API_VERSION
    };
    if (dsn.publicKey) {
      params.sentry_key = dsn.publicKey;
    }
    if (sdkInfo) {
      params.sentry_client = `${sdkInfo.name}/${sdkInfo.version}`;
    }
    return new URLSearchParams(params).toString();
  }
  function getEnvelopeEndpointWithUrlEncodedAuth(dsn, tunnel, sdkInfo) {
    return tunnel ? tunnel : `${_getIngestEndpoint(dsn)}?${_encodedAuth(dsn, sdkInfo)}`;
  }

  // node_modules/@sentry/core/build/esm/integration.js
  var installedIntegrations = [];
  function filterDuplicates(integrations) {
    const integrationsByName = {};
    integrations.forEach((currentInstance) => {
      const { name } = currentInstance;
      const existingInstance = integrationsByName[name];
      if (existingInstance && !existingInstance.isDefaultInstance && currentInstance.isDefaultInstance) {
        return;
      }
      integrationsByName[name] = currentInstance;
    });
    return Object.values(integrationsByName);
  }
  function getIntegrationsToSetup(options) {
    const defaultIntegrations = options.defaultIntegrations || [];
    const userIntegrations = options.integrations;
    defaultIntegrations.forEach((integration) => {
      integration.isDefaultInstance = true;
    });
    let integrations;
    if (Array.isArray(userIntegrations)) {
      integrations = [...defaultIntegrations, ...userIntegrations];
    } else if (typeof userIntegrations === "function") {
      const resolvedUserIntegrations = userIntegrations(defaultIntegrations);
      integrations = Array.isArray(resolvedUserIntegrations) ? resolvedUserIntegrations : [resolvedUserIntegrations];
    } else {
      integrations = defaultIntegrations;
    }
    return filterDuplicates(integrations);
  }
  function setupIntegrations(client, integrations) {
    const integrationIndex = {};
    integrations.forEach((integration) => {
      if (integration?.beforeSetup) {
        integration.beforeSetup(client);
      }
    });
    integrations.forEach((integration) => {
      if (integration) {
        setupIntegration(client, integration, integrationIndex);
      }
    });
    return integrationIndex;
  }
  function afterSetupIntegrations(client, integrations) {
    for (const integration of integrations) {
      if (integration?.afterAllSetup) {
        integration.afterAllSetup(client);
      }
    }
  }
  function setupIntegration(client, integration, integrationIndex) {
    if (integrationIndex[integration.name]) {
      DEBUG_BUILD && debug.log(`Integration skipped because it was already installed: ${integration.name}`);
      return;
    }
    integrationIndex[integration.name] = integration;
    if (!installedIntegrations.includes(integration.name) && typeof integration.setupOnce === "function") {
      integration.setupOnce();
      installedIntegrations.push(integration.name);
    }
    if (integration.setup && typeof integration.setup === "function") {
      integration.setup(client);
    }
    if (typeof integration.preprocessEvent === "function") {
      const callback = integration.preprocessEvent.bind(integration);
      client.on("preprocessEvent", (event, hint) => callback(event, hint, client));
    }
    if (typeof integration.processEvent === "function") {
      const callback = integration.processEvent.bind(integration);
      const processor = Object.assign((event, hint) => callback(event, hint, client), {
        id: integration.name
      });
      client.addEventProcessor(processor);
    }
    DEBUG_BUILD && debug.log(`Integration installed: ${integration.name}`);
  }
  function defineIntegration(fn) {
    return fn;
  }

  // node_modules/@sentry/core/build/esm/logs/envelope.js
  function createLogContainerEnvelopeItem(items) {
    return [
      {
        type: "log",
        item_count: items.length,
        content_type: "application/vnd.sentry.items.log+json"
      },
      {
        items
      }
    ];
  }
  function createLogEnvelope(logs, metadata, tunnel, dsn) {
    const headers = {};
    if (metadata?.sdk) {
      headers.sdk = {
        name: metadata.sdk.name,
        version: metadata.sdk.version
      };
    }
    if (!!tunnel && !!dsn) {
      headers.dsn = dsnToString(dsn);
    }
    return createEnvelope(headers, [createLogContainerEnvelopeItem(logs)]);
  }

  // node_modules/@sentry/core/build/esm/logs/internal.js
  function _INTERNAL_flushLogsBuffer(client, maybeLogBuffer) {
    const logBuffer = maybeLogBuffer ?? _INTERNAL_getLogBuffer(client) ?? [];
    if (logBuffer.length === 0) {
      return;
    }
    const clientOptions = client.getOptions();
    const envelope = createLogEnvelope(logBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());
    _getBufferMap().set(client, []);
    client.emit("flushLogs");
    client.sendEnvelope(envelope);
  }
  function _INTERNAL_getLogBuffer(client) {
    return _getBufferMap().get(client);
  }
  function _getBufferMap() {
    return getGlobalSingleton("clientToLogBufferMap", () => /* @__PURE__ */ new WeakMap());
  }

  // node_modules/@sentry/core/build/esm/metrics/envelope.js
  function createMetricContainerEnvelopeItem(items) {
    return [
      {
        type: "trace_metric",
        item_count: items.length,
        content_type: "application/vnd.sentry.items.trace-metric+json"
      },
      {
        items
      }
    ];
  }
  function createMetricEnvelope(metrics, metadata, tunnel, dsn) {
    const headers = {};
    if (metadata?.sdk) {
      headers.sdk = {
        name: metadata.sdk.name,
        version: metadata.sdk.version
      };
    }
    if (!!tunnel && !!dsn) {
      headers.dsn = dsnToString(dsn);
    }
    return createEnvelope(headers, [createMetricContainerEnvelopeItem(metrics)]);
  }

  // node_modules/@sentry/core/build/esm/metrics/internal.js
  function _INTERNAL_flushMetricsBuffer(client, maybeMetricBuffer) {
    const metricBuffer = maybeMetricBuffer ?? _INTERNAL_getMetricBuffer(client) ?? [];
    if (metricBuffer.length === 0) {
      return;
    }
    const clientOptions = client.getOptions();
    const envelope = createMetricEnvelope(metricBuffer, clientOptions._metadata, clientOptions.tunnel, client.getDsn());
    _getBufferMap2().set(client, []);
    client.emit("flushMetrics");
    client.sendEnvelope(envelope);
  }
  function _INTERNAL_getMetricBuffer(client) {
    return _getBufferMap2().get(client);
  }
  function _getBufferMap2() {
    return getGlobalSingleton("clientToMetricBufferMap", () => /* @__PURE__ */ new WeakMap());
  }

  // node_modules/@sentry/core/build/esm/utils/timer.js
  function safeUnref(timer) {
    if (typeof timer === "object" && typeof timer.unref === "function") {
      timer.unref();
    }
    return timer;
  }

  // node_modules/@sentry/core/build/esm/utils/promisebuffer.js
  var SENTRY_BUFFER_FULL_ERROR = Symbol.for("SentryBufferFullError");
  function makePromiseBuffer(limit = 100) {
    const buffer = /* @__PURE__ */ new Set();
    function isReady() {
      return buffer.size < limit;
    }
    function remove(task) {
      buffer.delete(task);
    }
    function add(taskProducer) {
      if (!isReady()) {
        return rejectedSyncPromise(SENTRY_BUFFER_FULL_ERROR);
      }
      const task = taskProducer();
      buffer.add(task);
      void task.then(
        () => remove(task),
        () => remove(task)
      );
      return task;
    }
    function drain(timeout) {
      if (!buffer.size) {
        return resolvedSyncPromise(true);
      }
      const drainPromise = Promise.allSettled(Array.from(buffer)).then(() => true);
      if (!timeout) {
        return drainPromise;
      }
      const promises = [
        drainPromise,
        new Promise((resolve) => safeUnref(setTimeout(() => resolve(false), timeout)))
      ];
      return Promise.race(promises);
    }
    return {
      get $() {
        return Array.from(buffer);
      },
      add,
      drain
    };
  }

  // node_modules/@sentry/core/build/esm/utils/ratelimit.js
  var DEFAULT_RETRY_AFTER = 60 * 1e3;
  function parseRetryAfterHeader(header, now = safeDateNow()) {
    const headerDelay = parseInt(`${header}`, 10);
    if (!isNaN(headerDelay)) {
      return headerDelay * 1e3;
    }
    const headerDate = Date.parse(`${header}`);
    if (!isNaN(headerDate)) {
      return headerDate - now;
    }
    return DEFAULT_RETRY_AFTER;
  }
  function disabledUntil(limits, dataCategory) {
    return limits[dataCategory] || limits.all || 0;
  }
  function isRateLimited(limits, dataCategory, now = safeDateNow()) {
    return disabledUntil(limits, dataCategory) > now;
  }
  function updateRateLimits(limits, { statusCode, headers }, now = safeDateNow()) {
    const updatedRateLimits = {
      ...limits
    };
    const rateLimitHeader = headers?.["x-sentry-rate-limits"];
    const retryAfterHeader = headers?.["retry-after"];
    if (rateLimitHeader) {
      for (const limit of rateLimitHeader.trim().split(",")) {
        const [retryAfter, categories, , , namespaces] = limit.split(":", 5);
        const headerDelay = parseInt(retryAfter, 10);
        const delay = (!isNaN(headerDelay) ? headerDelay : 60) * 1e3;
        if (!categories) {
          updatedRateLimits.all = now + delay;
        } else {
          for (const category of categories.split(";")) {
            if (category === "metric_bucket") {
              if (!namespaces || namespaces.split(";").includes("custom")) {
                updatedRateLimits[category] = now + delay;
              }
            } else {
              updatedRateLimits[category] = now + delay;
            }
          }
        }
      }
    } else if (retryAfterHeader) {
      updatedRateLimits.all = now + parseRetryAfterHeader(retryAfterHeader, now);
    } else if (statusCode === 429) {
      updatedRateLimits.all = now + 60 * 1e3;
    }
    return updatedRateLimits;
  }

  // node_modules/@sentry/core/build/esm/transports/base.js
  var DEFAULT_TRANSPORT_BUFFER_SIZE = 64;
  function createTransport(options, makeRequest, buffer = makePromiseBuffer(
    options.bufferSize || DEFAULT_TRANSPORT_BUFFER_SIZE
  )) {
    let rateLimits = {};
    const flush2 = (timeout) => buffer.drain(timeout);
    function send(envelope) {
      const filteredEnvelopeItems = [];
      forEachEnvelopeItem(envelope, (item, type) => {
        const dataCategory = envelopeItemTypeToDataCategory(type);
        if (isRateLimited(rateLimits, dataCategory)) {
          options.recordDroppedEvent("ratelimit_backoff", dataCategory);
        } else {
          filteredEnvelopeItems.push(item);
        }
      });
      if (filteredEnvelopeItems.length === 0) {
        return Promise.resolve({});
      }
      const filteredEnvelope = createEnvelope(envelope[0], filteredEnvelopeItems);
      const recordEnvelopeLoss = (reason) => {
        if (envelopeContainsItemType(filteredEnvelope, ["client_report"])) {
          DEBUG_BUILD && debug.warn(`Dropping client report. Will not send outcomes (reason: ${reason}).`);
          return;
        }
        forEachEnvelopeItem(filteredEnvelope, (item, type) => {
          options.recordDroppedEvent(reason, envelopeItemTypeToDataCategory(type));
        });
      };
      const requestTask = () => makeRequest({ body: serializeEnvelope(filteredEnvelope) }).then(
        (response) => {
          if (response.statusCode === 413) {
            DEBUG_BUILD && debug.error(
              "Sentry responded with status code 413. Envelope was discarded due to exceeding size limits."
            );
            recordEnvelopeLoss("send_error");
            return response;
          }
          if (DEBUG_BUILD && response.statusCode !== void 0 && (response.statusCode < 200 || response.statusCode >= 300)) {
            debug.warn(`Sentry responded with status code ${response.statusCode} to sent event.`);
          }
          rateLimits = updateRateLimits(rateLimits, response);
          return response;
        },
        (error2) => {
          recordEnvelopeLoss("network_error");
          DEBUG_BUILD && debug.error("Encountered error running transport request:", error2);
          throw error2;
        }
      );
      return buffer.add(requestTask).then(
        (result) => result,
        (error2) => {
          if (error2 === SENTRY_BUFFER_FULL_ERROR) {
            DEBUG_BUILD && debug.error("Skipped sending event because buffer is full.");
            recordEnvelopeLoss("queue_overflow");
            return Promise.resolve({});
          } else {
            throw error2;
          }
        }
      );
    }
    return {
      send,
      flush: flush2
    };
  }

  // node_modules/@sentry/core/build/esm/utils/clientreport.js
  function createClientReportEnvelope(discarded_events, dsn, timestamp) {
    const clientReportItem = [
      { type: "client_report" },
      {
        timestamp: timestamp || dateTimestampInSeconds(),
        discarded_events
      }
    ];
    return createEnvelope(dsn ? { dsn } : {}, [clientReportItem]);
  }

  // node_modules/@sentry/core/build/esm/utils/eventUtils.js
  function getPossibleEventMessages(event) {
    const possibleMessages = [];
    if (event.message) {
      possibleMessages.push(event.message);
    }
    try {
      const lastException = event.exception.values[event.exception.values.length - 1];
      if (lastException?.value) {
        possibleMessages.push(lastException.value);
        if (lastException.type) {
          possibleMessages.push(`${lastException.type}: ${lastException.value}`);
        }
      }
    } catch {
    }
    return possibleMessages;
  }

  // node_modules/@sentry/core/build/esm/utils/transactionEvent.js
  function convertTransactionEventToSpanJson(event) {
    const { trace_id, parent_span_id, span_id, status, origin, data, op } = event.contexts?.trace ?? {};
    return {
      data: data ?? {},
      description: event.transaction,
      op,
      parent_span_id,
      span_id: span_id ?? "",
      start_timestamp: event.start_timestamp ?? 0,
      status,
      timestamp: event.timestamp,
      trace_id: trace_id ?? "",
      origin,
      profile_id: data?.[SEMANTIC_ATTRIBUTE_PROFILE_ID],
      exclusive_time: data?.[SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME],
      measurements: event.measurements,
      is_segment: true
    };
  }
  function convertSpanJsonToTransactionEvent(span) {
    return {
      type: "transaction",
      timestamp: span.timestamp,
      start_timestamp: span.start_timestamp,
      transaction: span.description,
      contexts: {
        trace: {
          trace_id: span.trace_id,
          span_id: span.span_id,
          parent_span_id: span.parent_span_id,
          op: span.op,
          status: span.status,
          origin: span.origin,
          data: {
            ...span.data,
            ...span.profile_id && { [SEMANTIC_ATTRIBUTE_PROFILE_ID]: span.profile_id },
            ...span.exclusive_time && { [SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME]: span.exclusive_time }
          }
        }
      },
      measurements: span.measurements
    };
  }

  // node_modules/@sentry/core/build/esm/client.js
  var ALREADY_SEEN_ERROR = "Not capturing exception because it's already been captured.";
  var MISSING_RELEASE_FOR_SESSION_ERROR = "Discarded session because of missing or non-string release";
  var INTERNAL_ERROR_SYMBOL = Symbol.for("SentryInternalError");
  var DO_NOT_SEND_EVENT_SYMBOL = Symbol.for("SentryDoNotSendEventError");
  var DEFAULT_FLUSH_INTERVAL = 5e3;
  function _makeInternalError(message) {
    return {
      message,
      [INTERNAL_ERROR_SYMBOL]: true
    };
  }
  function _makeDoNotSendEventError(message) {
    return {
      message,
      [DO_NOT_SEND_EVENT_SYMBOL]: true
    };
  }
  function _isInternalError(error2) {
    return !!error2 && typeof error2 === "object" && INTERNAL_ERROR_SYMBOL in error2;
  }
  function _isDoNotSendEventError(error2) {
    return !!error2 && typeof error2 === "object" && DO_NOT_SEND_EVENT_SYMBOL in error2;
  }
  function setupWeightBasedFlushing(client, afterCaptureHook, flushHook, estimateSizeFn, flushFn) {
    let weight = 0;
    let flushTimeout;
    let isTimerActive = false;
    client.on(flushHook, () => {
      weight = 0;
      clearTimeout(flushTimeout);
      isTimerActive = false;
    });
    client.on(afterCaptureHook, (item) => {
      weight += estimateSizeFn(item);
      if (weight >= 8e5) {
        flushFn(client);
      } else if (!isTimerActive) {
        isTimerActive = true;
        flushTimeout = safeUnref(
          setTimeout(() => {
            flushFn(client);
          }, DEFAULT_FLUSH_INTERVAL)
        );
      }
    });
    client.on("flush", () => {
      flushFn(client);
    });
  }
  var Client = class {
    /** Options passed to the SDK. */
    /** The client Dsn, if specified in options. Without this Dsn, the SDK will be disabled. */
    /** Array of set up integrations. */
    /** Number of calls being processed */
    /** Holds flushable  */
    // eslint-disable-next-line @typescript-eslint/ban-types
    /**
     * Initializes this client instance.
     *
     * @param options Options for the client.
     */
    constructor(options) {
      this._options = options;
      this._integrations = {};
      this._numProcessing = 0;
      this._outcomes = {};
      this._hooks = {};
      this._eventProcessors = [];
      this._promiseBuffer = makePromiseBuffer(options.transportOptions?.bufferSize ?? DEFAULT_TRANSPORT_BUFFER_SIZE);
      if (options.dsn) {
        this._dsn = makeDsn(options.dsn);
      } else {
        DEBUG_BUILD && debug.warn("No DSN provided, client will not send events.");
      }
      if (this._dsn) {
        const url = getEnvelopeEndpointWithUrlEncodedAuth(
          this._dsn,
          options.tunnel,
          options._metadata ? options._metadata.sdk : void 0
        );
        this._transport = options.transport({
          tunnel: this._options.tunnel,
          recordDroppedEvent: this.recordDroppedEvent.bind(this),
          ...options.transportOptions,
          url
        });
      }
      this._options.enableLogs = this._options.enableLogs ?? this._options._experiments?.enableLogs;
      if (this._options.enableLogs) {
        setupWeightBasedFlushing(this, "afterCaptureLog", "flushLogs", estimateLogSizeInBytes, _INTERNAL_flushLogsBuffer);
      }
      const enableMetrics = this._options.enableMetrics ?? this._options._experiments?.enableMetrics ?? true;
      if (enableMetrics) {
        setupWeightBasedFlushing(
          this,
          "afterCaptureMetric",
          "flushMetrics",
          estimateMetricSizeInBytes,
          _INTERNAL_flushMetricsBuffer
        );
      }
    }
    /**
     * Captures an exception event and sends it to Sentry.
     *
     * Unlike `captureException` exported from every SDK, this method requires that you pass it the current scope.
     */
    captureException(exception, hint, scope) {
      const eventId = uuid4();
      if (checkOrSetAlreadyCaught(exception)) {
        DEBUG_BUILD && debug.log(ALREADY_SEEN_ERROR);
        return eventId;
      }
      const hintWithEventId = {
        event_id: eventId,
        ...hint
      };
      this._process(
        () => this.eventFromException(exception, hintWithEventId).then((event) => this._captureEvent(event, hintWithEventId, scope)).then((res) => res),
        "error"
      );
      return hintWithEventId.event_id;
    }
    /**
     * Captures a message event and sends it to Sentry.
     *
     * Unlike `captureMessage` exported from every SDK, this method requires that you pass it the current scope.
     */
    captureMessage(message, level, hint, currentScope) {
      const hintWithEventId = {
        event_id: uuid4(),
        ...hint
      };
      const eventMessage = isParameterizedString(message) ? message : String(message);
      const isMessage = isPrimitive(message);
      const promisedEvent = isMessage ? this.eventFromMessage(eventMessage, level, hintWithEventId) : this.eventFromException(message, hintWithEventId);
      this._process(
        () => promisedEvent.then((event) => this._captureEvent(event, hintWithEventId, currentScope)),
        isMessage ? "unknown" : "error"
      );
      return hintWithEventId.event_id;
    }
    /**
     * Captures a manually created event and sends it to Sentry.
     *
     * Unlike `captureEvent` exported from every SDK, this method requires that you pass it the current scope.
     */
    captureEvent(event, hint, currentScope) {
      const eventId = uuid4();
      if (hint?.originalException && checkOrSetAlreadyCaught(hint.originalException)) {
        DEBUG_BUILD && debug.log(ALREADY_SEEN_ERROR);
        return eventId;
      }
      const hintWithEventId = {
        event_id: eventId,
        ...hint
      };
      const sdkProcessingMetadata = event.sdkProcessingMetadata || {};
      const capturedSpanScope = sdkProcessingMetadata.capturedSpanScope;
      const capturedSpanIsolationScope = sdkProcessingMetadata.capturedSpanIsolationScope;
      const dataCategory = getDataCategoryByType(event.type);
      this._process(
        () => this._captureEvent(event, hintWithEventId, capturedSpanScope || currentScope, capturedSpanIsolationScope),
        dataCategory
      );
      return hintWithEventId.event_id;
    }
    /**
     * Captures a session.
     */
    captureSession(session) {
      this.sendSession(session);
      updateSession(session, { init: false });
    }
    /**
     * Create a cron monitor check in and send it to Sentry. This method is not available on all clients.
     *
     * @param checkIn An object that describes a check in.
     * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
     * to create a monitor automatically when sending a check in.
     * @param scope An optional scope containing event metadata.
     * @returns A string representing the id of the check in.
     */
    /**
     * Get the current Dsn.
     */
    getDsn() {
      return this._dsn;
    }
    /**
     * Get the current options.
     */
    getOptions() {
      return this._options;
    }
    /**
     * Get the SDK metadata.
     * @see SdkMetadata
     */
    getSdkMetadata() {
      return this._options._metadata;
    }
    /**
     * Returns the transport that is used by the client.
     * Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
     */
    getTransport() {
      return this._transport;
    }
    /**
     * Wait for all events to be sent or the timeout to expire, whichever comes first.
     *
     * @param timeout Maximum time in ms the client should wait for events to be flushed. Omitting this parameter will
     *   cause the client to wait until all events are sent before resolving the promise.
     * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
     * still events in the queue when the timeout is reached.
     */
    // @ts-expect-error - PromiseLike is a subset of Promise
    async flush(timeout) {
      const transport = this._transport;
      if (!transport) {
        return true;
      }
      this.emit("flush");
      const clientFinished = await this._isClientDoneProcessing(timeout);
      const transportFlushed = await transport.flush(timeout);
      return clientFinished && transportFlushed;
    }
    /**
     * Flush the event queue and set the client to `enabled = false`. See {@link Client.flush}.
     *
     * @param {number} timeout Maximum time in ms the client should wait before shutting down. Omitting this parameter will cause
     *   the client to wait until all events are sent before disabling itself.
     * @returns {Promise<boolean>} A promise which resolves to `true` if the flush completes successfully before the timeout, or `false` if
     * it doesn't.
     */
    // @ts-expect-error - PromiseLike is a subset of Promise
    async close(timeout) {
      _INTERNAL_flushLogsBuffer(this);
      const result = await this.flush(timeout);
      this.getOptions().enabled = false;
      this.emit("close");
      return result;
    }
    /**
     * Get all installed event processors.
     */
    getEventProcessors() {
      return this._eventProcessors;
    }
    /**
     * Adds an event processor that applies to any event processed by this client.
     */
    addEventProcessor(eventProcessor) {
      this._eventProcessors.push(eventProcessor);
    }
    /**
     * Initialize this client.
     * Call this after the client was set on a scope.
     */
    init() {
      if (this._isEnabled() || // Force integrations to be setup even if no DSN was set when we have
      // Spotlight enabled. This is particularly important for browser as we
      // don't support the `spotlight` option there and rely on the users
      // adding the `spotlightBrowserIntegration()` to their integrations which
      // wouldn't get initialized with the check below when there's no DSN set.
      this._options.integrations.some(({ name }) => name.startsWith("Spotlight"))) {
        this._setupIntegrations();
      }
    }
    /**
     * Gets an installed integration by its name.
     *
     * @returns {Integration|undefined} The installed integration or `undefined` if no integration with that `name` was installed.
     */
    getIntegrationByName(integrationName) {
      return this._integrations[integrationName];
    }
    /**
     * Add an integration to the client.
     * This can be used to e.g. lazy load integrations.
     * In most cases, this should not be necessary,
     * and you're better off just passing the integrations via `integrations: []` at initialization time.
     * However, if you find the need to conditionally load & add an integration, you can use `addIntegration` to do so.
     */
    addIntegration(integration) {
      const isAlreadyInstalled = this._integrations[integration.name];
      if (!isAlreadyInstalled && integration.beforeSetup) {
        integration.beforeSetup(this);
      }
      setupIntegration(this, integration, this._integrations);
      if (!isAlreadyInstalled) {
        afterSetupIntegrations(this, [integration]);
      }
    }
    /**
     * Send a fully prepared event to Sentry.
     */
    sendEvent(event, hint = {}) {
      this.emit("beforeSendEvent", event, hint);
      let env = createEventEnvelope(event, this._dsn, this._options._metadata, this._options.tunnel);
      for (const attachment of hint.attachments || []) {
        env = addItemToEnvelope(env, createAttachmentEnvelopeItem(attachment));
      }
      this.sendEnvelope(env).then((sendResponse) => this.emit("afterSendEvent", event, sendResponse));
    }
    /**
     * Send a session or session aggregrates to Sentry.
     */
    sendSession(session) {
      const { release: clientReleaseOption, environment: clientEnvironmentOption = DEFAULT_ENVIRONMENT } = this._options;
      if ("aggregates" in session) {
        const sessionAttrs = session.attrs || {};
        if (!sessionAttrs.release && !clientReleaseOption) {
          DEBUG_BUILD && debug.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
          return;
        }
        sessionAttrs.release = sessionAttrs.release || clientReleaseOption;
        sessionAttrs.environment = sessionAttrs.environment || clientEnvironmentOption;
        session.attrs = sessionAttrs;
      } else {
        if (!session.release && !clientReleaseOption) {
          DEBUG_BUILD && debug.warn(MISSING_RELEASE_FOR_SESSION_ERROR);
          return;
        }
        session.release = session.release || clientReleaseOption;
        session.environment = session.environment || clientEnvironmentOption;
      }
      this.emit("beforeSendSession", session);
      const env = createSessionEnvelope(session, this._dsn, this._options._metadata, this._options.tunnel);
      this.sendEnvelope(env);
    }
    /**
     * Record on the client that an event got dropped (ie, an event that will not be sent to Sentry).
     */
    recordDroppedEvent(reason, category, count = 1) {
      if (this._options.sendClientReports) {
        const key = `${reason}:${category}`;
        DEBUG_BUILD && debug.log(`Recording outcome: "${key}"${count > 1 ? ` (${count} times)` : ""}`);
        this._outcomes[key] = (this._outcomes[key] || 0) + count;
      }
    }
    /* eslint-disable @typescript-eslint/unified-signatures */
    /**
     * Register a callback for whenever a span is started.
     * Receives the span as argument.
     * @returns {() => void} A function that, when executed, removes the registered callback.
     */
    /**
     * Register a hook on this client.
     */
    on(hook, callback) {
      const hookCallbacks = this._hooks[hook] = this._hooks[hook] || /* @__PURE__ */ new Set();
      const uniqueCallback = (...args) => callback(...args);
      hookCallbacks.add(uniqueCallback);
      return () => {
        hookCallbacks.delete(uniqueCallback);
      };
    }
    /** Fire a hook whenever a span starts. */
    /**
     * Emit a hook that was previously registered via `on()`.
     */
    emit(hook, ...rest) {
      const callbacks = this._hooks[hook];
      if (callbacks) {
        callbacks.forEach((callback) => callback(...rest));
      }
    }
    /**
     * Send an envelope to Sentry.
     */
    // @ts-expect-error - PromiseLike is a subset of Promise
    async sendEnvelope(envelope) {
      this.emit("beforeEnvelope", envelope);
      if (this._isEnabled() && this._transport) {
        try {
          return await this._transport.send(envelope);
        } catch (reason) {
          DEBUG_BUILD && debug.error("Error while sending envelope:", reason);
          return {};
        }
      }
      DEBUG_BUILD && debug.error("Transport disabled");
      return {};
    }
    /**
     * Disposes of the client and releases all resources.
     *
     * Subclasses should override this method to clean up their own resources.
     * After calling dispose(), the client should not be used anymore.
     */
    dispose() {
    }
    /* eslint-enable @typescript-eslint/unified-signatures */
    /** Setup integrations for this client. */
    _setupIntegrations() {
      const { integrations } = this._options;
      this._integrations = setupIntegrations(this, integrations);
      afterSetupIntegrations(this, integrations);
    }
    /** Updates existing session based on the provided event */
    _updateSessionFromEvent(session, event) {
      let crashed = event.level === "fatal";
      let errored = false;
      const exceptions = event.exception?.values;
      if (exceptions) {
        errored = true;
        crashed = false;
        for (const ex of exceptions) {
          if (ex.mechanism?.handled === false) {
            crashed = true;
            break;
          }
        }
      }
      const sessionNonTerminal = session.status === "ok";
      const shouldUpdateAndSend = sessionNonTerminal && session.errors === 0 || sessionNonTerminal && crashed;
      if (shouldUpdateAndSend) {
        updateSession(session, {
          ...crashed && { status: "crashed" },
          errors: session.errors || Number(errored || crashed)
        });
        this.captureSession(session);
      }
    }
    /**
     * Determine if the client is finished processing. Returns a promise because it will wait `timeout` ms before saying
     * "no" (resolving to `false`) in order to give the client a chance to potentially finish first.
     *
     * @param timeout The time, in ms, after which to resolve to `false` if the client is still busy. Passing `0` (or not
     * passing anything) will make the promise wait as long as it takes for processing to finish before resolving to
     * `true`.
     * @returns A promise which will resolve to `true` if processing is already done or finishes before the timeout, and
     * `false` otherwise
     */
    async _isClientDoneProcessing(timeout) {
      let ticked = 0;
      while (!timeout || ticked < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (!this._numProcessing) {
          return true;
        }
        ticked++;
      }
      return false;
    }
    /** Determines whether this SDK is enabled and a transport is present. */
    _isEnabled() {
      return this.getOptions().enabled !== false && this._transport !== void 0;
    }
    /**
     * Adds common information to events.
     *
     * The information includes release and environment from `options`,
     * breadcrumbs and context (extra, tags and user) from the scope.
     *
     * Information that is already present in the event is never overwritten. For
     * nested objects, such as the context, keys are merged.
     *
     * @param event The original event.
     * @param hint May contain additional information about the original exception.
     * @param currentScope A scope containing event metadata.
     * @returns A new event with more information.
     */
    _prepareEvent(event, hint, currentScope, isolationScope) {
      const options = this.getOptions();
      const integrations = Object.keys(this._integrations);
      if (!hint.integrations && integrations?.length) {
        hint.integrations = integrations;
      }
      this.emit("preprocessEvent", event, hint);
      if (!event.type) {
        isolationScope.setLastEventId(event.event_id || hint.event_id);
      }
      return prepareEvent(options, event, hint, currentScope, this, isolationScope).then((evt) => {
        if (evt === null) {
          return evt;
        }
        this.emit("postprocessEvent", evt, hint);
        evt.contexts = {
          trace: { ...evt.contexts?.trace, ...getTraceContextFromScope(currentScope) },
          ...evt.contexts
        };
        const dynamicSamplingContext = getDynamicSamplingContextFromScope(this, currentScope);
        evt.sdkProcessingMetadata = {
          dynamicSamplingContext,
          ...evt.sdkProcessingMetadata
        };
        return evt;
      });
    }
    /**
     * Processes the event and logs an error in case of rejection
     * @param event
     * @param hint
     * @param scope
     */
    _captureEvent(event, hint = {}, currentScope = getCurrentScope(), isolationScope = getIsolationScope()) {
      if (DEBUG_BUILD && isErrorEvent2(event)) {
        debug.log(`Captured error event \`${getPossibleEventMessages(event)[0] || "<unknown>"}\``);
      }
      return this._processEvent(event, hint, currentScope, isolationScope).then(
        (finalEvent) => {
          return finalEvent.event_id;
        },
        (reason) => {
          if (DEBUG_BUILD) {
            if (_isDoNotSendEventError(reason)) {
              debug.log(reason.message);
            } else if (_isInternalError(reason)) {
              debug.warn(reason.message);
            } else {
              debug.warn(reason);
            }
          }
          return void 0;
        }
      );
    }
    /**
     * Processes an event (either error or message) and sends it to Sentry.
     *
     * This also adds breadcrumbs and context information to the event. However,
     * platform specific meta data (such as the User's IP address) must be added
     * by the SDK implementor.
     *
     *
     * @param event The event to send to Sentry.
     * @param hint May contain additional information about the original exception.
     * @param currentScope A scope containing event metadata.
     * @returns A SyncPromise that resolves with the event or rejects in case event was/will not be send.
     */
    _processEvent(event, hint, currentScope, isolationScope) {
      const options = this.getOptions();
      const { sampleRate } = options;
      const isTransaction = isTransactionEvent(event);
      const isError2 = isErrorEvent2(event);
      const eventType = event.type || "error";
      const beforeSendLabel = `before send for type \`${eventType}\``;
      const parsedSampleRate = typeof sampleRate === "undefined" ? void 0 : parseSampleRate(sampleRate);
      if (isError2 && typeof parsedSampleRate === "number" && safeMathRandom() > parsedSampleRate) {
        this.recordDroppedEvent("sample_rate", "error");
        return rejectedSyncPromise(
          _makeDoNotSendEventError(
            `Discarding event because it's not included in the random sample (sampling rate = ${sampleRate})`
          )
        );
      }
      const dataCategory = getDataCategoryByType(event.type);
      return this._prepareEvent(event, hint, currentScope, isolationScope).then((prepared) => {
        if (prepared === null) {
          this.recordDroppedEvent("event_processor", dataCategory);
          throw _makeDoNotSendEventError("An event processor returned `null`, will not send event.");
        }
        const isInternalException = hint.data?.__sentry__ === true;
        if (isInternalException) {
          return prepared;
        }
        const result = processBeforeSend(this, options, prepared, hint);
        return _validateBeforeSendResult(result, beforeSendLabel);
      }).then((processedEvent) => {
        if (processedEvent === null) {
          this.recordDroppedEvent("before_send", dataCategory);
          if (isTransaction) {
            const spans = event.spans || [];
            const spanCount = 1 + spans.length;
            this.recordDroppedEvent("before_send", "span", spanCount);
          }
          throw _makeDoNotSendEventError(`${beforeSendLabel} returned \`null\`, will not send event.`);
        }
        const session = currentScope.getSession() || isolationScope.getSession();
        if (isError2 && session) {
          this._updateSessionFromEvent(session, processedEvent);
        }
        if (isTransaction) {
          const spanCountBefore = processedEvent.sdkProcessingMetadata?.spanCountBeforeProcessing || 0;
          const spanCountAfter = processedEvent.spans ? processedEvent.spans.length : 0;
          const droppedSpanCount = spanCountBefore - spanCountAfter;
          if (droppedSpanCount > 0) {
            this.recordDroppedEvent("before_send", "span", droppedSpanCount);
          }
        }
        const transactionInfo = processedEvent.transaction_info;
        if (isTransaction && transactionInfo && processedEvent.transaction !== event.transaction) {
          const source = "custom";
          processedEvent.transaction_info = {
            ...transactionInfo,
            source
          };
        }
        this.sendEvent(processedEvent, hint);
        return processedEvent;
      }).then(null, (reason) => {
        if (_isDoNotSendEventError(reason) || _isInternalError(reason)) {
          throw reason;
        }
        this.captureException(reason, {
          mechanism: {
            handled: false,
            type: "internal"
          },
          data: {
            __sentry__: true
          },
          originalException: reason
        });
        throw _makeInternalError(
          `Event processing pipeline threw an error, original event will not be sent. Details have been sent as a new event.
Reason: ${reason}`
        );
      });
    }
    /**
     * Occupies the client with processing and event
     */
    _process(taskProducer, dataCategory) {
      this._numProcessing++;
      void this._promiseBuffer.add(taskProducer).then(
        (value) => {
          this._numProcessing--;
          return value;
        },
        (reason) => {
          this._numProcessing--;
          if (reason === SENTRY_BUFFER_FULL_ERROR) {
            this.recordDroppedEvent("queue_overflow", dataCategory);
          }
          return reason;
        }
      );
    }
    /**
     * Clears outcomes on this client and returns them.
     */
    _clearOutcomes() {
      const outcomes = this._outcomes;
      this._outcomes = {};
      return Object.entries(outcomes).map(([key, quantity]) => {
        const [reason, category] = key.split(":");
        return {
          reason,
          category,
          quantity
        };
      });
    }
    /**
     * Sends client reports as an envelope.
     */
    _flushOutcomes() {
      DEBUG_BUILD && debug.log("Flushing outcomes...");
      const outcomes = this._clearOutcomes();
      if (outcomes.length === 0) {
        DEBUG_BUILD && debug.log("No outcomes to send");
        return;
      }
      if (!this._dsn) {
        DEBUG_BUILD && debug.log("No dsn provided, will not send outcomes");
        return;
      }
      DEBUG_BUILD && debug.log("Sending outcomes:", outcomes);
      const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));
      this.sendEnvelope(envelope);
    }
    /**
     * Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`.
     */
  };
  function getDataCategoryByType(type) {
    return type === "replay_event" ? "replay" : type || "error";
  }
  function _validateBeforeSendResult(beforeSendResult, beforeSendLabel) {
    const invalidValueError = `${beforeSendLabel} must return \`null\` or a valid event.`;
    if (isThenable(beforeSendResult)) {
      return beforeSendResult.then(
        (event) => {
          if (!isPlainObject(event) && event !== null) {
            throw _makeInternalError(invalidValueError);
          }
          return event;
        },
        (e) => {
          throw _makeInternalError(`${beforeSendLabel} rejected with ${e}`);
        }
      );
    } else if (!isPlainObject(beforeSendResult) && beforeSendResult !== null) {
      throw _makeInternalError(invalidValueError);
    }
    return beforeSendResult;
  }
  function processBeforeSend(client, options, event, hint) {
    const { beforeSend, beforeSendTransaction, ignoreSpans } = options;
    const beforeSendSpan = !isStreamedBeforeSendSpanCallback(options.beforeSendSpan) && options.beforeSendSpan;
    let processedEvent = event;
    if (isErrorEvent2(processedEvent) && beforeSend) {
      return beforeSend(processedEvent, hint);
    }
    if (isTransactionEvent(processedEvent)) {
      if (beforeSendSpan || ignoreSpans) {
        const rootSpanJson = convertTransactionEventToSpanJson(processedEvent);
        if (ignoreSpans?.length && shouldIgnoreSpan(rootSpanJson, ignoreSpans)) {
          return null;
        }
        if (beforeSendSpan) {
          const processedRootSpanJson = beforeSendSpan(rootSpanJson);
          if (!processedRootSpanJson) {
            showSpanDropWarning();
          } else {
            processedEvent = merge(event, convertSpanJsonToTransactionEvent(processedRootSpanJson));
          }
        }
        if (processedEvent.spans) {
          const processedSpans = [];
          const initialSpans = processedEvent.spans;
          for (const span of initialSpans) {
            if (ignoreSpans?.length && shouldIgnoreSpan(span, ignoreSpans)) {
              reparentChildSpans(initialSpans, span);
              continue;
            }
            if (beforeSendSpan) {
              const processedSpan = beforeSendSpan(span);
              if (!processedSpan) {
                showSpanDropWarning();
                processedSpans.push(span);
              } else {
                processedSpans.push(processedSpan);
              }
            } else {
              processedSpans.push(span);
            }
          }
          const droppedSpans = processedEvent.spans.length - processedSpans.length;
          if (droppedSpans) {
            client.recordDroppedEvent("before_send", "span", droppedSpans);
          }
          processedEvent.spans = processedSpans;
        }
      }
      if (beforeSendTransaction) {
        if (processedEvent.spans) {
          const spanCountBefore = processedEvent.spans.length;
          processedEvent.sdkProcessingMetadata = {
            ...event.sdkProcessingMetadata,
            spanCountBeforeProcessing: spanCountBefore
          };
        }
        return beforeSendTransaction(processedEvent, hint);
      }
    }
    return processedEvent;
  }
  function isErrorEvent2(event) {
    return event.type === void 0;
  }
  function isTransactionEvent(event) {
    return event.type === "transaction";
  }
  function estimateMetricSizeInBytes(metric) {
    let weight = 0;
    if (metric.name) {
      weight += metric.name.length * 2;
    }
    weight += 8;
    return weight + estimateAttributesSizeInBytes(metric.attributes);
  }
  function estimateLogSizeInBytes(log2) {
    let weight = 0;
    if (log2.message) {
      weight += log2.message.length * 2;
    }
    return weight + estimateAttributesSizeInBytes(log2.attributes);
  }
  function estimateAttributesSizeInBytes(attributes) {
    if (!attributes) {
      return 0;
    }
    let weight = 0;
    Object.values(attributes).forEach((value) => {
      if (Array.isArray(value)) {
        weight += value.length * estimatePrimitiveSizeInBytes(value[0]);
      } else if (isPrimitive(value)) {
        weight += estimatePrimitiveSizeInBytes(value);
      } else {
        weight += 100;
      }
    });
    return weight;
  }
  function estimatePrimitiveSizeInBytes(value) {
    if (typeof value === "string") {
      return value.length * 2;
    } else if (typeof value === "number") {
      return 8;
    } else if (typeof value === "boolean") {
      return 4;
    }
    return 0;
  }

  // node_modules/@sentry/core/build/esm/utils/eventbuilder.js
  function hasSentryFetchUrlHost(error2) {
    return isError(error2) && "__sentry_fetch_url_host__" in error2 && typeof error2.__sentry_fetch_url_host__ === "string";
  }
  function _enhanceErrorWithSentryInfo(error2) {
    if (hasSentryFetchUrlHost(error2)) {
      return `${error2.message} (${error2.__sentry_fetch_url_host__})`;
    }
    return error2.message;
  }

  // node_modules/@sentry/core/build/esm/sdk.js
  function initAndBind(clientClass, options) {
    if (options.debug === true) {
      if (DEBUG_BUILD) {
        debug.enable();
      } else {
        consoleSandbox(() => {
          console.warn("[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.");
        });
      }
    }
    const scope = getCurrentScope();
    scope.update(options.initialScope);
    const client = new clientClass(options);
    setCurrentClient(client);
    client.init();
    return client;
  }
  function setCurrentClient(client) {
    getCurrentScope().setClient(client);
  }

  // node_modules/@sentry/core/build/esm/utils/url.js
  function parseUrl(url) {
    if (!url) {
      return {};
    }
    const match = url.match(/^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
    if (!match) {
      return {};
    }
    const query = match[6] || "";
    const fragment = match[8] || "";
    return {
      host: match[4],
      path: match[5],
      protocol: match[2],
      search: query,
      hash: fragment,
      relative: match[5] + query + fragment
      // everything minus origin
    };
  }
  function stripDataUrlContent(url, includeDataPrefix = true) {
    if (url.startsWith("data:")) {
      const match = url.match(/^data:([^;,]+)/);
      const mimeType = match ? match[1] : "text/plain";
      const isBase64 = url.includes(";base64,");
      const dataStart = url.indexOf(",");
      let dataPrefix = "";
      if (includeDataPrefix && dataStart !== -1) {
        const data = url.slice(dataStart + 1);
        dataPrefix = data.length > 10 ? `${data.slice(0, 10)}... [truncated]` : data;
      }
      return `data:${mimeType}${isBase64 ? ",base64" : ""}${dataPrefix ? `,${dataPrefix}` : ""}`;
    }
    return url;
  }

  // node_modules/@sentry/core/build/esm/utils/ipAddress.js
  function addAutoIpAddressToSession(session) {
    if ("aggregates" in session) {
      if (session.attrs?.["ip_address"] === void 0) {
        session.attrs = {
          ...session.attrs,
          ip_address: "{{auto}}"
        };
      }
    } else {
      if (session.ipAddress === void 0) {
        session.ipAddress = "{{auto}}";
      }
    }
  }

  // node_modules/@sentry/core/build/esm/utils/sdkMetadata.js
  function applySdkMetadata(options, name, names = [name], source = "npm") {
    const sdk = (options._metadata = options._metadata || {}).sdk = options._metadata.sdk || {};
    if (!sdk.name) {
      sdk.name = `sentry.javascript.${name}`;
      sdk.packages = names.map((name2) => ({
        name: `${source}:@sentry/${name2}`,
        version: SDK_VERSION
      }));
      sdk.version = SDK_VERSION;
    }
  }

  // node_modules/@sentry/core/build/esm/breadcrumbs.js
  var DEFAULT_BREADCRUMBS = 100;
  function addBreadcrumb(breadcrumb, hint) {
    const client = getClient();
    const isolationScope = getIsolationScope();
    if (!client) return;
    const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();
    if (maxBreadcrumbs <= 0) return;
    const timestamp = dateTimestampInSeconds();
    const mergedBreadcrumb = { timestamp, ...breadcrumb };
    const finalBreadcrumb = beforeBreadcrumb ? consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) : mergedBreadcrumb;
    if (finalBreadcrumb === null) return;
    if (client.emit) {
      client.emit("beforeAddBreadcrumb", finalBreadcrumb, hint);
    }
    isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
  }

  // node_modules/@sentry/core/build/esm/integrations/functiontostring.js
  var originalFunctionToString;
  var INTEGRATION_NAME = "FunctionToString";
  var SETUP_CLIENTS = /* @__PURE__ */ new WeakMap();
  var _functionToStringIntegration = (() => {
    return {
      name: INTEGRATION_NAME,
      setupOnce() {
        originalFunctionToString = Function.prototype.toString;
        try {
          Function.prototype.toString = function(...args) {
            const originalFunction = getOriginalFunction(this);
            const context = SETUP_CLIENTS.has(getClient()) && originalFunction !== void 0 ? originalFunction : this;
            return originalFunctionToString.apply(context, args);
          };
        } catch {
        }
      },
      setup(client) {
        SETUP_CLIENTS.set(client, true);
      }
    };
  });
  var functionToStringIntegration = defineIntegration(_functionToStringIntegration);

  // node_modules/@sentry/core/build/esm/integrations/eventFilters.js
  var DEFAULT_IGNORE_ERRORS = [
    /^Script error\.?$/,
    /^Javascript error: Script error\.? on line 0$/,
    /^ResizeObserver loop completed with undelivered notifications.$/,
    // The browser logs this when a ResizeObserver handler takes a bit longer. Usually this is not an actual issue though. It indicates slowness.
    /^Cannot redefine property: googletag$/,
    // This is thrown when google tag manager is used in combination with an ad blocker
    /^Can't find variable: gmo$/,
    // Error from Google Search App https://issuetracker.google.com/issues/396043331
    /^undefined is not an object \(evaluating 'a\.[A-Z]'\)$/,
    // Random error that happens but not actionable or noticeable to end-users.
    /can't redefine non-configurable property "solana"/,
    // Probably a browser extension or custom browser (Brave) throwing this error
    /vv\(\)\.getRestrictions is not a function/,
    // Error thrown by GTM, seemingly not affecting end-users
    /Can't find variable: _AutofillCallbackHandler/,
    // Unactionable error in instagram webview https://developers.facebook.com/community/threads/320013549791141/
    /Object Not Found Matching Id:\d+, MethodName:simulateEvent/,
    // unactionable error from CEFSharp, a .NET library that embeds chromium in .NET apps
    /^Java exception was raised during method invocation$/
    // error from Facebook Mobile browser (https://github.com/getsentry/sentry-javascript/issues/15065)
  ];
  var INTEGRATION_NAME2 = "EventFilters";
  var eventFiltersIntegration = defineIntegration((options = {}) => {
    let mergedOptions;
    return {
      name: INTEGRATION_NAME2,
      setup(client) {
        const clientOptions = client.getOptions();
        mergedOptions = _mergeOptions(options, clientOptions);
      },
      processEvent(event, _hint, client) {
        if (!mergedOptions) {
          const clientOptions = client.getOptions();
          mergedOptions = _mergeOptions(options, clientOptions);
        }
        return _shouldDropEvent(event, mergedOptions) ? null : event;
      }
    };
  });
  var inboundFiltersIntegration = defineIntegration(((options = {}) => {
    return {
      ...eventFiltersIntegration(options),
      name: "InboundFilters"
    };
  }));
  function _mergeOptions(internalOptions = {}, clientOptions = {}) {
    return {
      allowUrls: [...internalOptions.allowUrls || [], ...clientOptions.allowUrls || []],
      denyUrls: [...internalOptions.denyUrls || [], ...clientOptions.denyUrls || []],
      ignoreErrors: [
        ...internalOptions.ignoreErrors || [],
        ...clientOptions.ignoreErrors || [],
        ...internalOptions.disableErrorDefaults ? [] : DEFAULT_IGNORE_ERRORS
      ],
      ignoreTransactions: [...internalOptions.ignoreTransactions || [], ...clientOptions.ignoreTransactions || []]
    };
  }
  function _shouldDropEvent(event, options) {
    if (!event.type) {
      if (_isIgnoredError(event, options.ignoreErrors)) {
        DEBUG_BUILD && debug.warn(
          `Event dropped due to being matched by \`ignoreErrors\` option.
Event: ${getEventDescription(event)}`
        );
        return true;
      }
      if (_isUselessError(event)) {
        DEBUG_BUILD && debug.warn(
          `Event dropped due to not having an error message, error type or stacktrace.
Event: ${getEventDescription(
            event
          )}`
        );
        return true;
      }
      if (_isDeniedUrl(event, options.denyUrls)) {
        DEBUG_BUILD && debug.warn(
          `Event dropped due to being matched by \`denyUrls\` option.
Event: ${getEventDescription(
            event
          )}.
Url: ${_getEventFilterUrl(event)}`
        );
        return true;
      }
      if (!_isAllowedUrl(event, options.allowUrls)) {
        DEBUG_BUILD && debug.warn(
          `Event dropped due to not being matched by \`allowUrls\` option.
Event: ${getEventDescription(
            event
          )}.
Url: ${_getEventFilterUrl(event)}`
        );
        return true;
      }
    } else if (event.type === "transaction") {
      if (_isIgnoredTransaction(event, options.ignoreTransactions)) {
        DEBUG_BUILD && debug.warn(
          `Event dropped due to being matched by \`ignoreTransactions\` option.
Event: ${getEventDescription(event)}`
        );
        return true;
      }
    }
    return false;
  }
  function _isIgnoredError(event, ignoreErrors) {
    if (!ignoreErrors?.length) {
      return false;
    }
    return getPossibleEventMessages(event).some((message) => stringMatchesSomePattern(message, ignoreErrors));
  }
  function _isIgnoredTransaction(event, ignoreTransactions) {
    if (!ignoreTransactions?.length) {
      return false;
    }
    const name = event.transaction;
    return name ? stringMatchesSomePattern(name, ignoreTransactions) : false;
  }
  function _isDeniedUrl(event, denyUrls) {
    if (!denyUrls?.length) {
      return false;
    }
    const url = _getEventFilterUrl(event);
    return !url ? false : stringMatchesSomePattern(url, denyUrls);
  }
  function _isAllowedUrl(event, allowUrls) {
    if (!allowUrls?.length) {
      return true;
    }
    const url = _getEventFilterUrl(event);
    return !url ? true : stringMatchesSomePattern(url, allowUrls);
  }
  function _getLastValidUrl(frames = []) {
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      if (frame && frame.filename !== "<anonymous>" && frame.filename !== "[native code]") {
        return frame.filename || null;
      }
    }
    return null;
  }
  function _getEventFilterUrl(event) {
    try {
      const rootException = [...event.exception?.values ?? []].reverse().find((value) => value.mechanism?.parent_id === void 0 && value.stacktrace?.frames?.length);
      const frames = rootException?.stacktrace?.frames;
      return frames ? _getLastValidUrl(frames) : null;
    } catch {
      DEBUG_BUILD && debug.error(`Cannot extract url for event ${getEventDescription(event)}`);
      return null;
    }
  }
  function _isUselessError(event) {
    if (!event.exception?.values?.length) {
      return false;
    }
    return (
      // No top-level message
      !event.message && // There are no exception values that have a stacktrace, a non-generic-Error type or value
      !event.exception.values.some((value) => value.stacktrace || value.type && value.type !== "Error" || value.value)
    );
  }

  // node_modules/@sentry/core/build/esm/utils/aggregate-errors.js
  function applyAggregateErrorsToEvent(exceptionFromErrorImplementation, parser, key, limit, event, hint) {
    if (!event.exception?.values || !hint || !isInstanceOf(hint.originalException, Error)) {
      return;
    }
    const originalException = event.exception.values.length > 0 ? event.exception.values[event.exception.values.length - 1] : void 0;
    if (originalException) {
      event.exception.values = aggregateExceptionsFromError(
        exceptionFromErrorImplementation,
        parser,
        limit,
        hint.originalException,
        key,
        event.exception.values,
        originalException,
        0
      );
    }
  }
  function aggregateExceptionsFromError(exceptionFromErrorImplementation, parser, limit, error2, key, prevExceptions, exception, exceptionId) {
    if (prevExceptions.length >= limit + 1) {
      return prevExceptions;
    }
    let newExceptions = [...prevExceptions];
    if (isInstanceOf(error2[key], Error)) {
      applyExceptionGroupFieldsForParentException(exception, exceptionId, error2);
      const newException = exceptionFromErrorImplementation(parser, error2[key]);
      const newExceptionId = newExceptions.length;
      applyExceptionGroupFieldsForChildException(newException, key, newExceptionId, exceptionId);
      newExceptions = aggregateExceptionsFromError(
        exceptionFromErrorImplementation,
        parser,
        limit,
        error2[key],
        key,
        [newException, ...newExceptions],
        newException,
        newExceptionId
      );
    }
    if (isExceptionGroup(error2)) {
      error2.errors.forEach((childError, i) => {
        if (isInstanceOf(childError, Error)) {
          applyExceptionGroupFieldsForParentException(exception, exceptionId, error2);
          const newException = exceptionFromErrorImplementation(parser, childError);
          const newExceptionId = newExceptions.length;
          applyExceptionGroupFieldsForChildException(newException, `errors[${i}]`, newExceptionId, exceptionId);
          newExceptions = aggregateExceptionsFromError(
            exceptionFromErrorImplementation,
            parser,
            limit,
            childError,
            key,
            [newException, ...newExceptions],
            newException,
            newExceptionId
          );
        }
      });
    }
    return newExceptions;
  }
  function isExceptionGroup(error2) {
    return Array.isArray(error2.errors);
  }
  function applyExceptionGroupFieldsForParentException(exception, exceptionId, error2) {
    exception.mechanism = {
      handled: true,
      type: "auto.core.linked_errors",
      ...isExceptionGroup(error2) && { is_exception_group: true },
      ...exception.mechanism,
      exception_id: exceptionId
    };
  }
  function applyExceptionGroupFieldsForChildException(exception, source, exceptionId, parentId) {
    exception.mechanism = {
      handled: true,
      ...exception.mechanism,
      type: "chained",
      source,
      exception_id: exceptionId,
      parent_id: parentId
    };
  }

  // node_modules/@sentry/core/build/esm/instrument/console.js
  function addConsoleInstrumentationHandler(handler) {
    const type = "console";
    addHandler(type, handler);
    maybeInstrument(type, instrumentConsole);
  }
  function instrumentConsole() {
    if (!("console" in GLOBAL_OBJ)) {
      return;
    }
    CONSOLE_LEVELS.forEach(function(level) {
      if (!(level in GLOBAL_OBJ.console)) {
        return;
      }
      fill(GLOBAL_OBJ.console, level, function(originalConsoleMethod) {
        originalConsoleMethods[level] = originalConsoleMethod;
        return function(...args) {
          const handlerData = { args, level };
          triggerHandlers("console", handlerData);
          const log2 = originalConsoleMethods[level];
          log2?.apply(GLOBAL_OBJ.console, args);
        };
      });
    });
  }

  // node_modules/@sentry/core/build/esm/utils/severity.js
  function severityLevelFromString(level) {
    return level === "warn" ? "warning" : ["fatal", "error", "warning", "log", "info", "debug"].includes(level) ? level : "log";
  }

  // node_modules/@sentry/core/build/esm/integrations/dedupe.js
  var INTEGRATION_NAME3 = "Dedupe";
  var _dedupeIntegration = (() => {
    let previousEvent;
    return {
      name: INTEGRATION_NAME3,
      processEvent(currentEvent) {
        if (currentEvent.type) {
          return currentEvent;
        }
        try {
          if (_shouldDropEvent2(currentEvent, previousEvent)) {
            DEBUG_BUILD && debug.warn("Event dropped due to being a duplicate of previously captured event.");
            return null;
          }
        } catch {
        }
        return previousEvent = currentEvent;
      }
    };
  });
  var dedupeIntegration = defineIntegration(_dedupeIntegration);
  function _shouldDropEvent2(currentEvent, previousEvent) {
    if (!previousEvent) {
      return false;
    }
    if (_isSameMessageEvent(currentEvent, previousEvent)) {
      return true;
    }
    if (_isSameExceptionEvent(currentEvent, previousEvent)) {
      return true;
    }
    return false;
  }
  function _isSameMessageEvent(currentEvent, previousEvent) {
    const currentMessage = currentEvent.message;
    const previousMessage = previousEvent.message;
    if (!currentMessage && !previousMessage) {
      return false;
    }
    if (currentMessage && !previousMessage || !currentMessage && previousMessage) {
      return false;
    }
    if (currentMessage !== previousMessage) {
      return false;
    }
    if (!_isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }
    if (!_isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }
    return true;
  }
  function _isSameExceptionEvent(currentEvent, previousEvent) {
    const previousException = _getExceptionFromEvent(previousEvent);
    const currentException = _getExceptionFromEvent(currentEvent);
    if (!previousException || !currentException) {
      return false;
    }
    if (previousException.type !== currentException.type || previousException.value !== currentException.value) {
      return false;
    }
    if (!_isSameFingerprint(currentEvent, previousEvent)) {
      return false;
    }
    if (!_isSameStacktrace(currentEvent, previousEvent)) {
      return false;
    }
    return true;
  }
  function _isSameStacktrace(currentEvent, previousEvent) {
    let currentFrames = getFramesFromEvent(currentEvent);
    let previousFrames = getFramesFromEvent(previousEvent);
    if (!currentFrames && !previousFrames) {
      return true;
    }
    if (currentFrames && !previousFrames || !currentFrames && previousFrames) {
      return false;
    }
    currentFrames = currentFrames;
    previousFrames = previousFrames;
    if (previousFrames.length !== currentFrames.length) {
      return false;
    }
    for (let i = 0; i < previousFrames.length; i++) {
      const frameA = previousFrames[i];
      const frameB = currentFrames[i];
      if (frameA.filename !== frameB.filename || frameA.lineno !== frameB.lineno || frameA.colno !== frameB.colno || frameA.function !== frameB.function) {
        return false;
      }
    }
    return true;
  }
  function _isSameFingerprint(currentEvent, previousEvent) {
    let currentFingerprint = currentEvent.fingerprint;
    let previousFingerprint = previousEvent.fingerprint;
    if (!currentFingerprint && !previousFingerprint) {
      return true;
    }
    if (currentFingerprint && !previousFingerprint || !currentFingerprint && previousFingerprint) {
      return false;
    }
    currentFingerprint = currentFingerprint;
    previousFingerprint = previousFingerprint;
    try {
      return !!(currentFingerprint.join("") === previousFingerprint.join(""));
    } catch {
      return false;
    }
  }
  function _getExceptionFromEvent(event) {
    return event.exception?.values?.[0];
  }

  // node_modules/@sentry/core/build/esm/integrations/conversationId.js
  var INTEGRATION_NAME4 = "ConversationId";
  var _conversationIdIntegration = (() => {
    return {
      name: INTEGRATION_NAME4,
      setup(client) {
        client.on("spanStart", (span) => {
          const scopeData = getCurrentScope().getScopeData();
          const isolationScopeData = getIsolationScope().getScopeData();
          const conversationId = scopeData.conversationId || isolationScopeData.conversationId;
          if (conversationId) {
            const { op, data: attributes, description: name } = spanToJSON(span);
            if (!op?.startsWith("gen_ai.") && !attributes["ai.operationId"] && !name?.startsWith("ai.")) {
              return;
            }
            span.setAttribute(GEN_AI_CONVERSATION_ID_ATTRIBUTE, conversationId);
          }
        });
      }
    };
  });
  var conversationIdIntegration = defineIntegration(_conversationIdIntegration);

  // node_modules/@sentry/core/build/esm/utils/breadcrumb-log-level.js
  function getBreadcrumbLogLevelFromHttpStatusCode(statusCode) {
    if (statusCode === void 0) {
      return void 0;
    } else if (statusCode >= 400 && statusCode < 500) {
      return "warning";
    } else if (statusCode >= 500) {
      return "error";
    } else {
      return void 0;
    }
  }

  // node_modules/@sentry/core/build/esm/utils/supports.js
  var WINDOW2 = GLOBAL_OBJ;
  function supportsHistory() {
    return "history" in WINDOW2 && !!WINDOW2.history;
  }
  function _isFetchSupported() {
    if (!("fetch" in WINDOW2)) {
      return false;
    }
    try {
      new Headers();
      new Request("data:,");
      new Response();
      return true;
    } catch {
      return false;
    }
  }
  function isNativeFunction(func) {
    return func && /^function\s+\w+\(\)\s+\{\s+\[native code\]\s+\}$/.test(func.toString());
  }
  function supportsNativeFetch() {
    if (typeof EdgeRuntime === "string") {
      return true;
    }
    if (!_isFetchSupported()) {
      return false;
    }
    if (isNativeFunction(WINDOW2.fetch)) {
      return true;
    }
    let result = false;
    const doc = WINDOW2.document;
    if (doc && typeof doc.createElement === "function") {
      try {
        const sandbox = doc.createElement("iframe");
        sandbox.hidden = true;
        doc.head.appendChild(sandbox);
        if (sandbox.contentWindow?.fetch) {
          result = isNativeFunction(sandbox.contentWindow.fetch);
        }
        doc.head.removeChild(sandbox);
      } catch (err) {
        DEBUG_BUILD && debug.warn("Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ", err);
      }
    }
    return result;
  }

  // node_modules/@sentry/core/build/esm/instrument/fetch.js
  function addFetchInstrumentationHandler(handler, skipNativeFetchCheck) {
    const type = "fetch";
    addHandler(type, handler);
    maybeInstrument(type, () => instrumentFetch(void 0, skipNativeFetchCheck));
  }
  function instrumentFetch(onFetchResolved, skipNativeFetchCheck = false) {
    if (skipNativeFetchCheck && !supportsNativeFetch()) {
      return;
    }
    fill(GLOBAL_OBJ, "fetch", function(originalFetch) {
      return function(...args) {
        const virtualError = new Error();
        const { method, url } = parseFetchArgs(args);
        const handlerData = {
          args,
          fetchData: {
            method,
            url
          },
          startTimestamp: timestampInSeconds() * 1e3,
          // // Adding the error to be able to fingerprint the failed fetch event in HttpClient instrumentation
          virtualError,
          headers: getHeadersFromFetchArgs(args)
        };
        if (!onFetchResolved) {
          triggerHandlers("fetch", {
            ...handlerData
          });
        }
        return originalFetch.apply(GLOBAL_OBJ, args).then(
          async (response) => {
            if (onFetchResolved) {
              onFetchResolved(response);
            } else {
              triggerHandlers("fetch", {
                ...handlerData,
                endTimestamp: timestampInSeconds() * 1e3,
                response
              });
            }
            return response;
          },
          (error2) => {
            triggerHandlers("fetch", {
              ...handlerData,
              endTimestamp: timestampInSeconds() * 1e3,
              error: error2
            });
            if (isError(error2) && error2.stack === void 0) {
              error2.stack = virtualError.stack;
              addNonEnumerableProperty(error2, "framesToPop", 1);
            }
            const client = getClient();
            const enhanceOption = client?.getOptions().enhanceFetchErrorMessages ?? "always";
            const shouldEnhance = enhanceOption !== false;
            if (shouldEnhance && error2 instanceof TypeError && (error2.message === "Failed to fetch" || error2.message === "Load failed" || error2.message === "NetworkError when attempting to fetch resource.")) {
              try {
                const url2 = new URL(handlerData.fetchData.url);
                const hostname = url2.host;
                if (enhanceOption === "always") {
                  error2.message = `${error2.message} (${hostname})`;
                } else {
                  addNonEnumerableProperty(error2, "__sentry_fetch_url_host__", hostname);
                }
              } catch {
              }
            }
            throw error2;
          }
        );
      };
    });
  }
  function hasProp(obj, prop) {
    return !!obj && typeof obj === "object" && !!obj[prop];
  }
  function getUrlFromResource(resource) {
    if (typeof resource === "string") {
      return resource;
    }
    if (!resource) {
      return "";
    }
    if (hasProp(resource, "url")) {
      return resource.url;
    }
    if (resource.toString) {
      return resource.toString();
    }
    return "";
  }
  function parseFetchArgs(fetchArgs) {
    if (fetchArgs.length === 0) {
      return { method: "GET", url: "" };
    }
    if (fetchArgs.length === 2) {
      const [resource, options] = fetchArgs;
      return {
        url: getUrlFromResource(resource),
        method: hasProp(options, "method") ? String(options.method).toUpperCase() : (
          // Request object as first argument
          isRequest(resource) && hasProp(resource, "method") ? String(resource.method).toUpperCase() : "GET"
        )
      };
    }
    const arg = fetchArgs[0];
    return {
      url: getUrlFromResource(arg),
      method: hasProp(arg, "method") ? String(arg.method).toUpperCase() : "GET"
    };
  }
  function getHeadersFromFetchArgs(fetchArgs) {
    const [requestArgument, optionsArgument] = fetchArgs;
    try {
      if (typeof optionsArgument === "object" && optionsArgument !== null && "headers" in optionsArgument && optionsArgument.headers) {
        return new Headers(optionsArgument.headers);
      }
      if (isRequest(requestArgument)) {
        return new Headers(requestArgument.headers);
      }
    } catch {
    }
    return;
  }

  // node_modules/@sentry/core/build/esm/utils/env.js
  function getSDKSource() {
    return "npm";
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/helpers.js
  var WINDOW3 = GLOBAL_OBJ;
  var ignoreOnError = 0;
  function shouldIgnoreOnError() {
    return ignoreOnError > 0;
  }
  function ignoreNextOnError() {
    ignoreOnError++;
    setTimeout(() => {
      ignoreOnError--;
    });
  }
  function wrap(fn, options = {}) {
    function isFunction(fn2) {
      return typeof fn2 === "function";
    }
    if (!isFunction(fn)) {
      return fn;
    }
    try {
      const wrapper = fn.__sentry_wrapped__;
      if (wrapper) {
        if (typeof wrapper === "function") {
          return wrapper;
        } else {
          return fn;
        }
      }
      if (getOriginalFunction(fn)) {
        return fn;
      }
    } catch {
      return fn;
    }
    const sentryWrapped = function(...args) {
      try {
        const wrappedArguments = args.map((arg) => wrap(arg, options));
        return fn.apply(this, wrappedArguments);
      } catch (ex) {
        ignoreNextOnError();
        withScope2((scope) => {
          scope.addEventProcessor((event) => {
            if (options.mechanism) {
              addExceptionTypeValue(event, void 0, void 0);
              addExceptionMechanism(event, options.mechanism);
            }
            event.extra = {
              ...event.extra,
              arguments: args
            };
            return event;
          });
          captureException(ex);
        });
        throw ex;
      }
    };
    try {
      for (const property in fn) {
        if (Object.prototype.hasOwnProperty.call(fn, property)) {
          sentryWrapped[property] = fn[property];
        }
      }
    } catch {
    }
    markFunctionWrapped(sentryWrapped, fn);
    addNonEnumerableProperty(fn, "__sentry_wrapped__", sentryWrapped);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(sentryWrapped, "name");
      if (descriptor.configurable) {
        Object.defineProperty(sentryWrapped, "name", {
          get() {
            return fn.name;
          }
        });
      }
    } catch {
    }
    return sentryWrapped;
  }
  function getHttpRequestData() {
    const url = getLocationHref();
    const { referrer } = WINDOW3.document || {};
    const { userAgent } = WINDOW3.navigator || {};
    const headers = {
      ...referrer && { Referer: referrer },
      ...userAgent && { "User-Agent": userAgent }
    };
    const request = {
      url,
      headers
    };
    return request;
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/eventbuilder.js
  function exceptionFromError2(stackParser, ex) {
    const frames = parseStackFrames2(stackParser, ex);
    const exception = {
      type: extractType(ex),
      value: extractMessage(ex)
    };
    if (frames.length) {
      exception.stacktrace = { frames };
    }
    if (exception.type === void 0 && exception.value === "") {
      exception.value = "Unrecoverable error caught";
    }
    return exception;
  }
  function eventFromPlainObject(stackParser, exception, syntheticException, isUnhandledRejection) {
    const client = getClient();
    const normalizeDepth = client?.getOptions().normalizeDepth;
    const errorFromProp = getErrorPropertyFromObject(exception);
    const extra = {
      __serialized__: normalizeToSize(exception, normalizeDepth)
    };
    if (errorFromProp) {
      return {
        exception: {
          values: [exceptionFromError2(stackParser, errorFromProp)]
        },
        extra
      };
    }
    const event = {
      exception: {
        values: [
          {
            type: isEvent(exception) ? exception.constructor.name : isUnhandledRejection ? "UnhandledRejection" : "Error",
            value: getNonErrorObjectExceptionValue(exception, { isUnhandledRejection })
          }
        ]
      },
      extra
    };
    if (syntheticException) {
      const frames = parseStackFrames2(stackParser, syntheticException);
      if (frames.length) {
        event.exception.values[0].stacktrace = { frames };
      }
    }
    return event;
  }
  function eventFromError(stackParser, ex) {
    return {
      exception: {
        values: [exceptionFromError2(stackParser, ex)]
      }
    };
  }
  function parseStackFrames2(stackParser, ex) {
    const stacktrace = ex.stacktrace || ex.stack || "";
    const skipLines = getSkipFirstStackStringLines(ex);
    const framesToPop = getPopFirstTopFrames(ex);
    try {
      return stackParser(stacktrace, skipLines, framesToPop);
    } catch {
    }
    return [];
  }
  var reactMinifiedRegexp = /Minified React error #\d+;/i;
  function getSkipFirstStackStringLines(ex) {
    if (ex && reactMinifiedRegexp.test(ex.message)) {
      return 1;
    }
    return 0;
  }
  function getPopFirstTopFrames(ex) {
    if (typeof ex.framesToPop === "number") {
      return ex.framesToPop;
    }
    return 0;
  }
  function isWebAssemblyException(exception) {
    if (typeof WebAssembly !== "undefined" && typeof WebAssembly.Exception !== "undefined") {
      return exception instanceof WebAssembly.Exception;
    } else {
      return false;
    }
  }
  function extractType(ex) {
    const name = ex?.name;
    if (!name && isWebAssemblyException(ex)) {
      const hasTypeInMessage = ex.message && Array.isArray(ex.message) && ex.message.length == 2;
      return hasTypeInMessage ? ex.message[0] : "WebAssembly.Exception";
    }
    return name;
  }
  function extractMessage(ex) {
    const message = ex?.message;
    if (isWebAssemblyException(ex)) {
      if (Array.isArray(ex.message) && ex.message.length == 2) {
        return ex.message[1];
      }
      return "wasm exception";
    }
    if (!message) {
      return "No error message";
    }
    if (message.error && typeof message.error.message === "string") {
      return _enhanceErrorWithSentryInfo(message.error);
    }
    return _enhanceErrorWithSentryInfo(ex);
  }
  function eventFromException(stackParser, exception, hint, attachStacktrace) {
    const syntheticException = hint?.syntheticException || void 0;
    const event = eventFromUnknownInput2(stackParser, exception, syntheticException, attachStacktrace);
    addExceptionMechanism(event);
    event.level = "error";
    if (hint?.event_id) {
      event.event_id = hint.event_id;
    }
    return resolvedSyncPromise(event);
  }
  function eventFromMessage2(stackParser, message, level = "info", hint, attachStacktrace) {
    const syntheticException = hint?.syntheticException || void 0;
    const event = eventFromString(stackParser, message, syntheticException, attachStacktrace);
    event.level = level;
    if (hint?.event_id) {
      event.event_id = hint.event_id;
    }
    return resolvedSyncPromise(event);
  }
  function eventFromUnknownInput2(stackParser, exception, syntheticException, attachStacktrace, isUnhandledRejection) {
    let event;
    if (isErrorEvent(exception) && exception.error) {
      const errorEvent = exception;
      return eventFromError(stackParser, errorEvent.error);
    }
    if (isDOMError(exception) || isDOMException(exception)) {
      const domException = exception;
      if ("stack" in exception) {
        event = eventFromError(stackParser, exception);
      } else {
        const name = domException.name || (isDOMError(domException) ? "DOMError" : "DOMException");
        const message = domException.message ? `${name}: ${domException.message}` : name;
        event = eventFromString(stackParser, message, syntheticException, attachStacktrace);
        addExceptionTypeValue(event, message);
      }
      if ("code" in domException) {
        event.tags = { ...event.tags, "DOMException.code": `${domException.code}` };
      }
      return event;
    }
    if (isError(exception)) {
      return eventFromError(stackParser, exception);
    }
    if (isPlainObject(exception) || isEvent(exception)) {
      const objectException = exception;
      event = eventFromPlainObject(stackParser, objectException, syntheticException, isUnhandledRejection);
      addExceptionMechanism(event, {
        synthetic: true
      });
      return event;
    }
    event = eventFromString(stackParser, exception, syntheticException, attachStacktrace);
    addExceptionTypeValue(event, `${exception}`, void 0);
    addExceptionMechanism(event, {
      synthetic: true
    });
    return event;
  }
  function eventFromString(stackParser, message, syntheticException, attachStacktrace) {
    const event = {};
    if (attachStacktrace && syntheticException) {
      const frames = parseStackFrames2(stackParser, syntheticException);
      if (frames.length) {
        event.exception = {
          values: [{ value: message, stacktrace: { frames } }]
        };
      }
      addExceptionMechanism(event, { synthetic: true });
    }
    if (isParameterizedString(message)) {
      const { __sentry_template_string__, __sentry_template_values__ } = message;
      event.logentry = {
        message: __sentry_template_string__,
        params: __sentry_template_values__
      };
      return event;
    }
    event.message = message;
    return event;
  }
  function getNonErrorObjectExceptionValue(exception, { isUnhandledRejection }) {
    const keys = extractExceptionKeysForMessage(exception);
    const captureType = isUnhandledRejection ? "promise rejection" : "exception";
    if (isErrorEvent(exception)) {
      return `Event \`ErrorEvent\` captured as ${captureType} with message \`${exception.message}\``;
    }
    if (isEvent(exception)) {
      const className = getObjectClassName(exception);
      return `Event \`${className}\` (type=${exception.type}) captured as ${captureType}`;
    }
    return `Object captured as ${captureType} with keys: ${keys}`;
  }
  function getObjectClassName(obj) {
    try {
      const prototype = Object.getPrototypeOf(obj);
      return prototype ? prototype.constructor.name : void 0;
    } catch {
    }
  }
  function getErrorPropertyFromObject(obj) {
    return Object.values(obj).find((v) => v instanceof Error);
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/client.js
  var BrowserClient = class extends Client {
    /**
     * Creates a new Browser SDK instance.
     *
     * @param options Configuration options for this SDK.
     */
    constructor(options) {
      const opts = applyDefaultOptions(options);
      const sdkSource = WINDOW3.SENTRY_SDK_SOURCE || getSDKSource();
      applySdkMetadata(opts, "browser", ["browser"], sdkSource);
      if (opts._metadata?.sdk) {
        opts._metadata.sdk.settings = {
          infer_ip: opts.sendDefaultPii ? "auto" : "never",
          // purposefully allowing already passed settings to override the default
          ...opts._metadata.sdk.settings
        };
      }
      super(opts);
      const {
        sendDefaultPii,
        sendClientReports,
        enableLogs,
        _experiments,
        enableMetrics: enableMetricsOption
      } = this._options;
      const enableMetrics = enableMetricsOption ?? _experiments?.enableMetrics ?? true;
      if (WINDOW3.document && (sendClientReports || enableLogs || enableMetrics)) {
        WINDOW3.document.addEventListener("visibilitychange", () => {
          if (WINDOW3.document.visibilityState === "hidden") {
            if (sendClientReports) {
              this._flushOutcomes();
            }
            if (enableLogs) {
              _INTERNAL_flushLogsBuffer(this);
            }
            if (enableMetrics) {
              _INTERNAL_flushMetricsBuffer(this);
            }
          }
        });
      }
      if (sendDefaultPii) {
        this.on("beforeSendSession", addAutoIpAddressToSession);
      }
    }
    /**
     * @inheritDoc
     */
    eventFromException(exception, hint) {
      return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
    }
    /**
     * @inheritDoc
     */
    eventFromMessage(message, level = "info", hint) {
      return eventFromMessage2(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
    }
    /**
     * @inheritDoc
     */
    _prepareEvent(event, hint, currentScope, isolationScope) {
      event.platform = event.platform || "javascript";
      return super._prepareEvent(event, hint, currentScope, isolationScope);
    }
  };
  function applyDefaultOptions(optionsArg) {
    return {
      release: typeof __SENTRY_RELEASE__ === "string" ? __SENTRY_RELEASE__ : WINDOW3.SENTRY_RELEASE?.id,
      // This supports the variable that sentry-webpack-plugin injects
      sendClientReports: true,
      // We default this to true, as it is the safer scenario
      parentSpanIsAlwaysRootSpan: true,
      ...optionsArg
    };
  }

  // node_modules/@sentry-internal/browser-utils/build/esm/debug-build.js
  var DEBUG_BUILD2 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;

  // node_modules/@sentry-internal/browser-utils/build/esm/types.js
  var WINDOW4 = GLOBAL_OBJ;

  // node_modules/@sentry-internal/browser-utils/build/esm/instrument/dom.js
  var DEBOUNCE_DURATION = 1e3;
  var debounceTimerID;
  var lastCapturedEventType;
  var lastCapturedEventTargetId;
  function addClickKeypressInstrumentationHandler(handler) {
    const type = "dom";
    addHandler(type, handler);
    maybeInstrument(type, instrumentDOM);
  }
  function instrumentDOM() {
    if (!WINDOW4.document) {
      return;
    }
    const triggerDOMHandler = triggerHandlers.bind(null, "dom");
    const globalDOMEventHandler = makeDOMEventHandler(triggerDOMHandler, true);
    WINDOW4.document.addEventListener("click", globalDOMEventHandler, false);
    WINDOW4.document.addEventListener("keypress", globalDOMEventHandler, false);
    ["EventTarget", "Node"].forEach((target) => {
      const globalObject = WINDOW4;
      const proto = globalObject[target]?.prototype;
      if (!proto?.hasOwnProperty?.("addEventListener")) {
        return;
      }
      fill(proto, "addEventListener", function(originalAddEventListener) {
        return function(type, listener, options) {
          if (type === "click" || type == "keypress") {
            try {
              const handlers2 = this.__sentry_instrumentation_handlers__ = this.__sentry_instrumentation_handlers__ || {};
              const handlerForType = handlers2[type] = handlers2[type] || { refCount: 0 };
              if (!handlerForType.handler) {
                const handler = makeDOMEventHandler(triggerDOMHandler);
                handlerForType.handler = handler;
                originalAddEventListener.call(this, type, handler, options);
              }
              handlerForType.refCount++;
            } catch {
            }
          }
          return originalAddEventListener.call(this, type, listener, options);
        };
      });
      fill(
        proto,
        "removeEventListener",
        function(originalRemoveEventListener) {
          return function(type, listener, options) {
            if (type === "click" || type == "keypress") {
              try {
                const handlers2 = this.__sentry_instrumentation_handlers__ || {};
                const handlerForType = handlers2[type];
                if (handlerForType) {
                  handlerForType.refCount--;
                  if (handlerForType.refCount <= 0) {
                    originalRemoveEventListener.call(this, type, handlerForType.handler, options);
                    handlerForType.handler = void 0;
                    delete handlers2[type];
                  }
                  if (Object.keys(handlers2).length === 0) {
                    delete this.__sentry_instrumentation_handlers__;
                  }
                }
              } catch {
              }
            }
            return originalRemoveEventListener.call(this, type, listener, options);
          };
        }
      );
    });
  }
  function isSimilarToLastCapturedEvent(event) {
    if (event.type !== lastCapturedEventType) {
      return false;
    }
    try {
      if (!event.target || event.target._sentryId !== lastCapturedEventTargetId) {
        return false;
      }
    } catch {
    }
    return true;
  }
  function shouldSkipDOMEvent(eventType, target) {
    if (eventType !== "keypress") {
      return false;
    }
    if (!target?.tagName) {
      return true;
    }
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
      return false;
    }
    return true;
  }
  function makeDOMEventHandler(handler, globalListener = false) {
    return (event) => {
      if (!event || event["_sentryCaptured"]) {
        return;
      }
      const target = getEventTarget(event);
      if (shouldSkipDOMEvent(event.type, target)) {
        return;
      }
      addNonEnumerableProperty(event, "_sentryCaptured", true);
      if (target && !target._sentryId) {
        addNonEnumerableProperty(target, "_sentryId", uuid4());
      }
      const name = event.type === "keypress" ? "input" : event.type;
      if (!isSimilarToLastCapturedEvent(event)) {
        const handlerData = { event, name, global: globalListener };
        handler(handlerData);
        lastCapturedEventType = event.type;
        lastCapturedEventTargetId = target ? target._sentryId : void 0;
      }
      clearTimeout(debounceTimerID);
      debounceTimerID = WINDOW4.setTimeout(() => {
        lastCapturedEventTargetId = void 0;
        lastCapturedEventType = void 0;
      }, DEBOUNCE_DURATION);
    };
  }
  function getEventTarget(event) {
    try {
      return event.target;
    } catch {
      return null;
    }
  }

  // node_modules/@sentry-internal/browser-utils/build/esm/instrument/history.js
  var lastHref;
  function addHistoryInstrumentationHandler(handler) {
    const type = "history";
    addHandler(type, handler);
    maybeInstrument(type, instrumentHistory);
  }
  function instrumentHistory() {
    WINDOW4.addEventListener("popstate", () => {
      const to = WINDOW4.location.href;
      const from = lastHref;
      lastHref = to;
      if (from === to) {
        return;
      }
      const handlerData = { from, to };
      triggerHandlers("history", handlerData);
    });
    if (!supportsHistory()) {
      return;
    }
    function historyReplacementFunction(originalHistoryFunction) {
      return function(...args) {
        const url = args.length > 2 ? args[2] : void 0;
        if (url) {
          const from = lastHref;
          const to = getAbsoluteUrl(String(url));
          lastHref = to;
          if (from === to) {
            return originalHistoryFunction.apply(this, args);
          }
          const handlerData = { from, to };
          triggerHandlers("history", handlerData);
        }
        return originalHistoryFunction.apply(this, args);
      };
    }
    fill(WINDOW4.history, "pushState", historyReplacementFunction);
    fill(WINDOW4.history, "replaceState", historyReplacementFunction);
  }
  function getAbsoluteUrl(urlOrPath) {
    try {
      const url = new URL(urlOrPath, WINDOW4.location.origin);
      return url.toString();
    } catch {
      return urlOrPath;
    }
  }

  // node_modules/@sentry-internal/browser-utils/build/esm/getNativeImplementation.js
  var cachedImplementations = {};
  function getNativeImplementation(name) {
    const cached = cachedImplementations[name];
    if (cached) {
      return cached;
    }
    let impl = WINDOW4[name];
    if (isNativeFunction(impl)) {
      return cachedImplementations[name] = impl.bind(WINDOW4);
    }
    const document2 = WINDOW4.document;
    if (document2 && typeof document2.createElement === "function") {
      try {
        const sandbox = document2.createElement("iframe");
        sandbox.hidden = true;
        document2.head.appendChild(sandbox);
        const contentWindow = sandbox.contentWindow;
        if (contentWindow?.[name]) {
          impl = contentWindow[name];
        }
        document2.head.removeChild(sandbox);
      } catch (e) {
        DEBUG_BUILD2 && debug.warn(`Could not create sandbox iframe for ${name} check, bailing to window.${name}: `, e);
      }
    }
    if (!impl) {
      return impl;
    }
    return cachedImplementations[name] = impl.bind(WINDOW4);
  }
  function clearCachedImplementation(name) {
    cachedImplementations[name] = void 0;
  }

  // node_modules/@sentry-internal/browser-utils/build/esm/instrument/xhr.js
  var SENTRY_XHR_DATA_KEY = "__sentry_xhr_v3__";
  function addXhrInstrumentationHandler(handler) {
    const type = "xhr";
    addHandler(type, handler);
    maybeInstrument(type, instrumentXHR);
  }
  function instrumentXHR() {
    if (!WINDOW4.XMLHttpRequest) {
      return;
    }
    const xhrproto = XMLHttpRequest.prototype;
    xhrproto.open = new Proxy(xhrproto.open, {
      apply(originalOpen, xhrOpenThisArg, xhrOpenArgArray) {
        const virtualError = new Error();
        const startTimestamp = timestampInSeconds() * 1e3;
        const method = isString(xhrOpenArgArray[0]) ? xhrOpenArgArray[0].toUpperCase() : void 0;
        const url = parseXhrUrlArg(xhrOpenArgArray[1]);
        if (!method || !url) {
          return originalOpen.apply(xhrOpenThisArg, xhrOpenArgArray);
        }
        xhrOpenThisArg[SENTRY_XHR_DATA_KEY] = {
          method,
          url,
          request_headers: {}
        };
        if (method === "POST" && url.match(/sentry_key/)) {
          xhrOpenThisArg.__sentry_own_request__ = true;
        }
        const onreadystatechangeHandler = () => {
          const xhrInfo = xhrOpenThisArg[SENTRY_XHR_DATA_KEY];
          if (!xhrInfo) {
            return;
          }
          if (xhrOpenThisArg.readyState === 4) {
            try {
              xhrInfo.status_code = xhrOpenThisArg.status;
            } catch {
            }
            const handlerData = {
              endTimestamp: timestampInSeconds() * 1e3,
              startTimestamp,
              xhr: xhrOpenThisArg,
              virtualError
            };
            triggerHandlers("xhr", handlerData);
          }
        };
        if ("onreadystatechange" in xhrOpenThisArg && typeof xhrOpenThisArg.onreadystatechange === "function") {
          xhrOpenThisArg.onreadystatechange = new Proxy(xhrOpenThisArg.onreadystatechange, {
            apply(originalOnreadystatechange, onreadystatechangeThisArg, onreadystatechangeArgArray) {
              onreadystatechangeHandler();
              return originalOnreadystatechange.apply(onreadystatechangeThisArg, onreadystatechangeArgArray);
            }
          });
        } else {
          xhrOpenThisArg.addEventListener("readystatechange", onreadystatechangeHandler);
        }
        xhrOpenThisArg.setRequestHeader = new Proxy(xhrOpenThisArg.setRequestHeader, {
          apply(originalSetRequestHeader, setRequestHeaderThisArg, setRequestHeaderArgArray) {
            const [header, value] = setRequestHeaderArgArray;
            const xhrInfo = setRequestHeaderThisArg[SENTRY_XHR_DATA_KEY];
            if (xhrInfo && isString(header) && isString(value)) {
              xhrInfo.request_headers[header.toLowerCase()] = value;
            }
            return originalSetRequestHeader.apply(setRequestHeaderThisArg, setRequestHeaderArgArray);
          }
        });
        return originalOpen.apply(xhrOpenThisArg, xhrOpenArgArray);
      }
    });
    xhrproto.send = new Proxy(xhrproto.send, {
      apply(originalSend, sendThisArg, sendArgArray) {
        const sentryXhrData = sendThisArg[SENTRY_XHR_DATA_KEY];
        if (!sentryXhrData) {
          return originalSend.apply(sendThisArg, sendArgArray);
        }
        if (sendArgArray[0] !== void 0) {
          sentryXhrData.body = sendArgArray[0];
        }
        const handlerData = {
          startTimestamp: timestampInSeconds() * 1e3,
          xhr: sendThisArg
        };
        triggerHandlers("xhr", handlerData);
        return originalSend.apply(sendThisArg, sendArgArray);
      }
    });
  }
  function parseXhrUrlArg(url) {
    if (isString(url)) {
      return url;
    }
    try {
      return url.toString();
    } catch {
    }
    return void 0;
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/transports/fetch.js
  var DEFAULT_BROWSER_TRANSPORT_BUFFER_SIZE = 40;
  function makeFetchTransport(options, nativeFetch = getNativeImplementation("fetch")) {
    let pendingBodySize = 0;
    let pendingCount = 0;
    async function makeRequest(request) {
      const requestSize = request.body.length;
      pendingBodySize += requestSize;
      pendingCount++;
      const requestOptions = {
        body: request.body,
        method: "POST",
        referrerPolicy: "strict-origin",
        headers: options.headers,
        // Outgoing requests are usually cancelled when navigating to a different page, causing a "TypeError: Failed to
        // fetch" error and sending a "network_error" client-outcome - in Chrome, the request status shows "(cancelled)".
        // The `keepalive` flag keeps outgoing requests alive, even when switching pages. We want this since we're
        // frequently sending events right before the user is switching pages (eg. when finishing navigation transactions).
        // Gotchas:
        // - `keepalive` isn't supported by Firefox
        // - As per spec (https://fetch.spec.whatwg.org/#http-network-or-cache-fetch):
        //   If the sum of contentLength and inflightKeepaliveBytes is greater than 64 kibibytes, then return a network error.
        //   We will therefore only activate the flag when we're below that limit.
        // There is also a limit of requests that can be open at the same time, so we also limit this to 15
        // See https://github.com/getsentry/sentry-javascript/pull/7553 for details
        keepalive: pendingBodySize <= 6e4 && pendingCount < 15,
        ...options.fetchOptions
      };
      try {
        const response = await nativeFetch(options.url, requestOptions);
        return {
          statusCode: response.status,
          headers: {
            "x-sentry-rate-limits": response.headers.get("X-Sentry-Rate-Limits"),
            "retry-after": response.headers.get("Retry-After")
          }
        };
      } catch (e) {
        clearCachedImplementation("fetch");
        throw e;
      } finally {
        pendingBodySize -= requestSize;
        pendingCount--;
      }
    }
    return createTransport(
      options,
      makeRequest,
      makePromiseBuffer(options.bufferSize || DEFAULT_BROWSER_TRANSPORT_BUFFER_SIZE)
    );
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/debug-build.js
  var DEBUG_BUILD3 = typeof __SENTRY_DEBUG__ === "undefined" || __SENTRY_DEBUG__;

  // node_modules/@sentry/browser/build/npm/esm/prod/stack-parsers.js
  var CHROME_PRIORITY = 30;
  var GECKO_PRIORITY = 50;
  function createFrame(filename, func, lineno, colno) {
    const frame = {
      filename,
      function: func === "<anonymous>" ? UNKNOWN_FUNCTION : func,
      in_app: true
      // All browser frames are considered in_app
    };
    if (lineno !== void 0) {
      frame.lineno = lineno;
    }
    if (colno !== void 0) {
      frame.colno = colno;
    }
    return frame;
  }
  var chromeRegexNoFnName = /^\s*at (\S+?)(?::(\d+))(?::(\d+))\s*$/i;
  var chromeRegex = /^\s*at (?:(.+?\)(?: \[.+\])?|.*?) ?\((?:address at )?)?(?:async )?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
  var chromeEvalRegex = /\((\S*)(?::(\d+))(?::(\d+))\)/;
  var chromeDataUriRegex = /at (.+?) ?\(data:(.+?),/;
  var chromeStackParserFn = (line) => {
    const dataUriMatch = line.match(chromeDataUriRegex);
    if (dataUriMatch) {
      return {
        filename: `<data:${dataUriMatch[2]}>`,
        function: dataUriMatch[1]
      };
    }
    const noFnParts = chromeRegexNoFnName.exec(line);
    if (noFnParts) {
      const [, filename, line2, col] = noFnParts;
      return createFrame(filename, UNKNOWN_FUNCTION, +line2, +col);
    }
    const parts = chromeRegex.exec(line);
    if (parts) {
      const isEval = parts[2]?.indexOf("eval") === 0;
      if (isEval) {
        const subMatch = chromeEvalRegex.exec(parts[2]);
        if (subMatch) {
          parts[2] = subMatch[1];
          parts[3] = subMatch[2];
          parts[4] = subMatch[3];
        }
      }
      const [func, filename] = extractSafariExtensionDetails(parts[1] || UNKNOWN_FUNCTION, parts[2]);
      return createFrame(filename, func, parts[3] ? +parts[3] : void 0, parts[4] ? +parts[4] : void 0);
    }
    return;
  };
  var chromeStackLineParser = [CHROME_PRIORITY, chromeStackParserFn];
  var geckoREgex = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. /=]+)(?::(\d+))?(?::(\d+))?\s*$/i;
  var geckoEvalRegex = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
  var gecko = (line) => {
    const parts = geckoREgex.exec(line);
    if (parts) {
      const isEval = parts[3] && parts[3].indexOf(" > eval") > -1;
      if (isEval) {
        const subMatch = geckoEvalRegex.exec(parts[3]);
        if (subMatch) {
          parts[1] = parts[1] || "eval";
          parts[3] = subMatch[1];
          parts[4] = subMatch[2];
          parts[5] = "";
        }
      }
      let filename = parts[3];
      let func = parts[1] || UNKNOWN_FUNCTION;
      [func, filename] = extractSafariExtensionDetails(func, filename);
      return createFrame(filename, func, parts[4] ? +parts[4] : void 0, parts[5] ? +parts[5] : void 0);
    }
    return;
  };
  var geckoStackLineParser = [GECKO_PRIORITY, gecko];
  var defaultStackLineParsers = [chromeStackLineParser, geckoStackLineParser];
  var defaultStackParser = createStackParser(...defaultStackLineParsers);
  var extractSafariExtensionDetails = (func, filename) => {
    const isSafariExtension = func.indexOf("safari-extension") !== -1;
    const isSafariWebExtension = func.indexOf("safari-web-extension") !== -1;
    return isSafariExtension || isSafariWebExtension ? [
      func.indexOf("@") !== -1 ? func.split("@")[0] : UNKNOWN_FUNCTION,
      isSafariExtension ? `safari-extension:${filename}` : `safari-web-extension:${filename}`
    ] : [func, filename];
  };

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/breadcrumbs.js
  var MAX_ALLOWED_STRING_LENGTH = 1024;
  var INTEGRATION_NAME5 = "Breadcrumbs";
  var _breadcrumbsIntegration = ((options = {}) => {
    const _options = {
      console: true,
      dom: true,
      fetch: true,
      history: true,
      sentry: true,
      xhr: true,
      ...options
    };
    return {
      name: INTEGRATION_NAME5,
      setup(client) {
        if (_options.console) {
          addConsoleInstrumentationHandler(_getConsoleBreadcrumbHandler(client));
        }
        if (_options.dom) {
          addClickKeypressInstrumentationHandler(_getDomBreadcrumbHandler(client, _options.dom));
        }
        if (_options.xhr) {
          addXhrInstrumentationHandler(_getXhrBreadcrumbHandler(client));
        }
        if (_options.fetch) {
          addFetchInstrumentationHandler(_getFetchBreadcrumbHandler(client));
        }
        if (_options.history) {
          addHistoryInstrumentationHandler(_getHistoryBreadcrumbHandler(client));
        }
        if (_options.sentry) {
          client.on("beforeSendEvent", _getSentryBreadcrumbHandler(client));
        }
      }
    };
  });
  var breadcrumbsIntegration = defineIntegration(_breadcrumbsIntegration);
  function _getSentryBreadcrumbHandler(client) {
    return function addSentryBreadcrumb(event) {
      if (getClient() !== client) {
        return;
      }
      addBreadcrumb(
        {
          category: `sentry.${event.type === "transaction" ? "transaction" : "event"}`,
          event_id: event.event_id,
          level: event.level,
          message: getEventDescription(event)
        },
        {
          event
        }
      );
    };
  }
  function _getDomBreadcrumbHandler(client, dom) {
    return function _innerDomBreadcrumb(handlerData) {
      if (getClient() !== client) {
        return;
      }
      let target;
      let componentName;
      let keyAttrs = typeof dom === "object" ? dom.serializeAttribute : void 0;
      let maxStringLength = typeof dom === "object" && typeof dom.maxStringLength === "number" ? dom.maxStringLength : void 0;
      if (maxStringLength && maxStringLength > MAX_ALLOWED_STRING_LENGTH) {
        DEBUG_BUILD3 && debug.warn(
          `\`dom.maxStringLength\` cannot exceed ${MAX_ALLOWED_STRING_LENGTH}, but a value of ${maxStringLength} was configured. Sentry will use ${MAX_ALLOWED_STRING_LENGTH} instead.`
        );
        maxStringLength = MAX_ALLOWED_STRING_LENGTH;
      }
      if (typeof keyAttrs === "string") {
        keyAttrs = [keyAttrs];
      }
      try {
        const event = handlerData.event;
        const element = _isEvent(event) ? event.target : event;
        target = htmlTreeAsString(element, { keyAttrs, maxStringLength });
        componentName = getComponentName(element);
      } catch {
        target = "<unknown>";
      }
      if (target.length === 0) {
        return;
      }
      const breadcrumb = {
        category: `ui.${handlerData.name}`,
        message: target
      };
      if (componentName) {
        breadcrumb.data = { "ui.component_name": componentName };
      }
      addBreadcrumb(breadcrumb, {
        event: handlerData.event,
        name: handlerData.name,
        global: handlerData.global
      });
    };
  }
  function _getConsoleBreadcrumbHandler(client) {
    return function _consoleBreadcrumb(handlerData) {
      if (getClient() !== client) {
        return;
      }
      const breadcrumb = {
        category: "console",
        data: {
          arguments: handlerData.args,
          logger: "console"
        },
        level: severityLevelFromString(handlerData.level),
        message: safeJoin(handlerData.args, " ")
      };
      if (handlerData.level === "assert") {
        if (handlerData.args[0] === false) {
          breadcrumb.message = `Assertion failed: ${safeJoin(handlerData.args.slice(1), " ") || "console.assert"}`;
          breadcrumb.data.arguments = handlerData.args.slice(1);
        } else {
          return;
        }
      }
      addBreadcrumb(breadcrumb, {
        input: handlerData.args,
        level: handlerData.level
      });
    };
  }
  function _getXhrBreadcrumbHandler(client) {
    return function _xhrBreadcrumb(handlerData) {
      if (getClient() !== client) {
        return;
      }
      const { startTimestamp, endTimestamp } = handlerData;
      const sentryXhrData = handlerData.xhr[SENTRY_XHR_DATA_KEY];
      if (!startTimestamp || !endTimestamp || !sentryXhrData) {
        return;
      }
      const { method, url, status_code, body } = sentryXhrData;
      const data = {
        method,
        url,
        status_code
      };
      const hint = {
        xhr: handlerData.xhr,
        input: body,
        startTimestamp,
        endTimestamp
      };
      const breadcrumb = {
        category: "xhr",
        data,
        type: "http",
        level: getBreadcrumbLogLevelFromHttpStatusCode(status_code)
      };
      client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
      addBreadcrumb(breadcrumb, hint);
    };
  }
  function _getFetchBreadcrumbHandler(client) {
    return function _fetchBreadcrumb(handlerData) {
      if (getClient() !== client) {
        return;
      }
      const { startTimestamp, endTimestamp } = handlerData;
      if (!endTimestamp) {
        return;
      }
      if (handlerData.fetchData.url.match(/sentry_key/) && handlerData.fetchData.method === "POST") {
        return;
      }
      if (handlerData.error) {
        const hint = {
          data: handlerData.error,
          input: handlerData.args,
          startTimestamp,
          endTimestamp
        };
        const breadcrumb = {
          category: "fetch",
          data: handlerData.fetchData,
          level: "error",
          type: "http"
        };
        client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
        addBreadcrumb(breadcrumb, hint);
      } else {
        const response = handlerData.response;
        const data = {
          ...handlerData.fetchData,
          status_code: response?.status
        };
        const hint = {
          input: handlerData.args,
          response,
          startTimestamp,
          endTimestamp
        };
        const breadcrumb = {
          category: "fetch",
          data,
          type: "http",
          level: getBreadcrumbLogLevelFromHttpStatusCode(data.status_code)
        };
        client.emit("beforeOutgoingRequestBreadcrumb", breadcrumb, hint);
        addBreadcrumb(breadcrumb, hint);
      }
    };
  }
  function _getHistoryBreadcrumbHandler(client) {
    return function _historyBreadcrumb(handlerData) {
      if (getClient() !== client) {
        return;
      }
      let from = handlerData.from;
      let to = handlerData.to;
      const parsedLoc = parseUrl(WINDOW3.location.href);
      let parsedFrom = from ? parseUrl(from) : void 0;
      const parsedTo = parseUrl(to);
      if (!parsedFrom?.path) {
        parsedFrom = parsedLoc;
      }
      if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host) {
        to = parsedTo.relative;
      }
      if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host) {
        from = parsedFrom.relative;
      }
      addBreadcrumb({
        category: "navigation",
        data: {
          from,
          to
        }
      });
    };
  }
  function _isEvent(event) {
    return !!event && !!event.target;
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/browserapierrors.js
  var DEFAULT_EVENT_TARGET = "EventTarget,Window,Node,ApplicationCache,AudioTrackList,BroadcastChannel,ChannelMergerNode,CryptoOperation,EventSource,FileReader,HTMLUnknownElement,IDBDatabase,IDBRequest,IDBTransaction,KeyOperation,MediaController,MessagePort,ModalWindow,Notification,SVGElementInstance,Screen,SharedWorker,TextTrack,TextTrackCue,TextTrackList,WebSocket,WebSocketWorker,Worker,XMLHttpRequest,XMLHttpRequestEventTarget,XMLHttpRequestUpload".split(
    ","
  );
  var INTEGRATION_NAME6 = "BrowserApiErrors";
  var _browserApiErrorsIntegration = ((options = {}) => {
    const _options = {
      XMLHttpRequest: true,
      eventTarget: true,
      requestAnimationFrame: true,
      setInterval: true,
      setTimeout: true,
      unregisterOriginalCallbacks: false,
      ...options
    };
    return {
      name: INTEGRATION_NAME6,
      // TODO: This currently only works for the first client this is setup
      // We may want to adjust this to check for client etc.
      setupOnce() {
        if (_options.setTimeout) {
          fill(WINDOW3, "setTimeout", _wrapTimeFunction);
        }
        if (_options.setInterval) {
          fill(WINDOW3, "setInterval", _wrapTimeFunction);
        }
        if (_options.requestAnimationFrame) {
          fill(WINDOW3, "requestAnimationFrame", _wrapRAF);
        }
        if (_options.XMLHttpRequest && "XMLHttpRequest" in WINDOW3) {
          fill(XMLHttpRequest.prototype, "send", _wrapXHR);
        }
        const eventTargetOption = _options.eventTarget;
        if (eventTargetOption) {
          const eventTarget = Array.isArray(eventTargetOption) ? eventTargetOption : DEFAULT_EVENT_TARGET;
          eventTarget.forEach((target) => _wrapEventTarget(target, _options));
        }
      }
    };
  });
  var browserApiErrorsIntegration = defineIntegration(_browserApiErrorsIntegration);
  function _wrapTimeFunction(original) {
    return function(...args) {
      const originalCallback = args[0];
      args[0] = wrap(originalCallback, {
        mechanism: {
          handled: false,
          type: `auto.browser.browserapierrors.${getFunctionName(original)}`
        }
      });
      return original.apply(this, args);
    };
  }
  function _wrapRAF(original) {
    return function(callback) {
      return original.apply(this, [
        wrap(callback, {
          mechanism: {
            data: {
              handler: getFunctionName(original)
            },
            handled: false,
            type: "auto.browser.browserapierrors.requestAnimationFrame"
          }
        })
      ]);
    };
  }
  function _wrapXHR(originalSend) {
    return function(...args) {
      const xhr = this;
      const xmlHttpRequestProps = ["onload", "onerror", "onprogress", "onreadystatechange"];
      xmlHttpRequestProps.forEach((prop) => {
        if (prop in xhr && typeof xhr[prop] === "function") {
          fill(xhr, prop, function(original) {
            const wrapOptions = {
              mechanism: {
                data: {
                  handler: getFunctionName(original)
                },
                handled: false,
                type: `auto.browser.browserapierrors.xhr.${prop}`
              }
            };
            const originalFunction = getOriginalFunction(original);
            if (originalFunction) {
              wrapOptions.mechanism.data.handler = getFunctionName(originalFunction);
            }
            return wrap(original, wrapOptions);
          });
        }
      });
      return originalSend.apply(this, args);
    };
  }
  function _wrapEventTarget(target, integrationOptions) {
    const globalObject = WINDOW3;
    const proto = globalObject[target]?.prototype;
    if (!proto?.hasOwnProperty?.("addEventListener")) {
      return;
    }
    fill(proto, "addEventListener", function(original) {
      return function(eventName, fn, options) {
        try {
          if (isEventListenerObject(fn)) {
            fn.handleEvent = wrap(fn.handleEvent, {
              mechanism: {
                data: {
                  handler: getFunctionName(fn),
                  target
                },
                handled: false,
                type: "auto.browser.browserapierrors.handleEvent"
              }
            });
          }
        } catch {
        }
        if (integrationOptions.unregisterOriginalCallbacks) {
          unregisterOriginalCallback(this, eventName, fn);
        }
        return original.apply(this, [
          eventName,
          wrap(fn, {
            mechanism: {
              data: {
                handler: getFunctionName(fn),
                target
              },
              handled: false,
              type: "auto.browser.browserapierrors.addEventListener"
            }
          }),
          options
        ]);
      };
    });
    fill(proto, "removeEventListener", function(originalRemoveEventListener) {
      return function(eventName, fn, options) {
        try {
          const originalEventHandler = fn.__sentry_wrapped__;
          if (originalEventHandler) {
            originalRemoveEventListener.call(this, eventName, originalEventHandler, options);
          }
        } catch {
        }
        return originalRemoveEventListener.call(this, eventName, fn, options);
      };
    });
  }
  function isEventListenerObject(obj) {
    return typeof obj.handleEvent === "function";
  }
  function unregisterOriginalCallback(target, eventName, fn) {
    if (target && typeof target === "object" && "removeEventListener" in target && typeof target.removeEventListener === "function") {
      target.removeEventListener(eventName, fn);
    }
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/browsersession.js
  var browserSessionIntegration = defineIntegration((options = {}) => {
    const lifecycle = options.lifecycle ?? "route";
    return {
      name: "BrowserSession",
      setupOnce() {
        if (typeof WINDOW3.document === "undefined") {
          DEBUG_BUILD3 && debug.warn("Using the `browserSessionIntegration` in non-browser environments is not supported.");
          return;
        }
        startSession({ ignoreDuration: true });
        captureSession();
        const isolationScope = getIsolationScope();
        let previousUser = isolationScope.getUser();
        isolationScope.addScopeListener((scope) => {
          const maybeNewUser = scope.getUser();
          if (previousUser?.id !== maybeNewUser?.id || previousUser?.ip_address !== maybeNewUser?.ip_address) {
            captureSession();
            previousUser = maybeNewUser;
          }
        });
        if (lifecycle === "route") {
          addHistoryInstrumentationHandler(({ from, to }) => {
            if (from !== to) {
              startSession({ ignoreDuration: true });
              captureSession();
            }
          });
        }
      }
    };
  });

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/culturecontext.js
  var INTEGRATION_NAME7 = "CultureContext";
  var _cultureContextIntegration = (() => {
    return {
      name: INTEGRATION_NAME7,
      preprocessEvent(event) {
        const culture = getCultureContext();
        if (culture) {
          event.contexts = {
            ...event.contexts,
            culture: { ...culture, ...event.contexts?.culture }
          };
        }
      }
    };
  });
  var cultureContextIntegration = defineIntegration(_cultureContextIntegration);
  function getCultureContext() {
    try {
      const intl = WINDOW3.Intl;
      if (!intl) {
        return void 0;
      }
      const options = intl.DateTimeFormat().resolvedOptions();
      return {
        locale: options.locale,
        timezone: options.timeZone,
        calendar: options.calendar
      };
    } catch {
      return void 0;
    }
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/globalhandlers.js
  var INTEGRATION_NAME8 = "GlobalHandlers";
  var _globalHandlersIntegration = ((options = {}) => {
    const _options = {
      onerror: true,
      onunhandledrejection: true,
      ...options
    };
    return {
      name: INTEGRATION_NAME8,
      setupOnce() {
        Error.stackTraceLimit = 50;
      },
      setup(client) {
        if (_options.onerror) {
          _installGlobalOnErrorHandler(client);
          globalHandlerLog("onerror");
        }
        if (_options.onunhandledrejection) {
          _installGlobalOnUnhandledRejectionHandler(client);
          globalHandlerLog("onunhandledrejection");
        }
      }
    };
  });
  var globalHandlersIntegration = defineIntegration(_globalHandlersIntegration);
  function _installGlobalOnErrorHandler(client) {
    addGlobalErrorInstrumentationHandler((data) => {
      const { stackParser, attachStacktrace } = getOptions();
      if (getClient() !== client || shouldIgnoreOnError()) {
        return;
      }
      const { msg, url, line, column, error: error2 } = data;
      const event = _enhanceEventWithInitialFrame(
        eventFromUnknownInput2(stackParser, error2 || msg, void 0, attachStacktrace, false),
        url,
        line,
        column
      );
      event.level = "error";
      captureEvent(event, {
        originalException: error2,
        mechanism: {
          handled: false,
          type: "auto.browser.global_handlers.onerror"
        }
      });
    });
  }
  function _installGlobalOnUnhandledRejectionHandler(client) {
    addGlobalUnhandledRejectionInstrumentationHandler((e) => {
      const { stackParser, attachStacktrace } = getOptions();
      if (getClient() !== client || shouldIgnoreOnError()) {
        return;
      }
      const error2 = _getUnhandledRejectionError(e);
      const event = isPrimitive(error2) ? _eventFromRejectionWithPrimitive(error2) : eventFromUnknownInput2(stackParser, error2, void 0, attachStacktrace, true);
      event.level = "error";
      captureEvent(event, {
        originalException: error2,
        mechanism: {
          handled: false,
          type: "auto.browser.global_handlers.onunhandledrejection"
        }
      });
    });
  }
  function _getUnhandledRejectionError(error2) {
    if (isPrimitive(error2)) {
      return error2;
    }
    try {
      if ("reason" in error2) {
        return error2.reason;
      }
      if ("detail" in error2 && "reason" in error2.detail) {
        return error2.detail.reason;
      }
    } catch {
    }
    return error2;
  }
  function _eventFromRejectionWithPrimitive(reason) {
    return {
      exception: {
        values: [
          {
            type: "UnhandledRejection",
            // String() is needed because the Primitive type includes symbols (which can't be automatically stringified)
            value: `Non-Error promise rejection captured with value: ${String(reason)}`
          }
        ]
      }
    };
  }
  function _enhanceEventWithInitialFrame(event, url, lineno, colno) {
    const e = event.exception = event.exception || {};
    const ev = e.values = e.values || [];
    const ev0 = ev[0] = ev[0] || {};
    const ev0s = ev0.stacktrace = ev0.stacktrace || {};
    const ev0sf = ev0s.frames = ev0s.frames || [];
    if (ev0sf.length === 0) {
      ev0sf.push({
        colno,
        lineno,
        filename: getFilenameFromUrl(url) ?? getLocationHref(),
        function: UNKNOWN_FUNCTION,
        in_app: true
      });
    }
    return event;
  }
  function globalHandlerLog(type) {
    DEBUG_BUILD3 && debug.log(`Global Handler attached: ${type}`);
  }
  function getOptions() {
    const client = getClient();
    const options = client?.getOptions() || {
      stackParser: () => [],
      attachStacktrace: false
    };
    return options;
  }
  function getFilenameFromUrl(url) {
    if (!isString(url) || url.length === 0) {
      return void 0;
    }
    if (url.startsWith("data:")) {
      return `<${stripDataUrlContent(url, false)}>`;
    }
    return url;
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/httpcontext.js
  var httpContextIntegration = defineIntegration(() => {
    return {
      name: "HttpContext",
      preprocessEvent(event) {
        if (!WINDOW3.navigator && !WINDOW3.location && !WINDOW3.document) {
          return;
        }
        const reqData = getHttpRequestData();
        const headers = {
          ...reqData.headers,
          ...event.request?.headers
        };
        event.request = {
          ...reqData,
          ...event.request,
          headers
        };
      }
    };
  });

  // node_modules/@sentry/browser/build/npm/esm/prod/integrations/linkederrors.js
  var DEFAULT_KEY = "cause";
  var DEFAULT_LIMIT = 5;
  var INTEGRATION_NAME9 = "LinkedErrors";
  var _linkedErrorsIntegration = ((options = {}) => {
    const limit = options.limit || DEFAULT_LIMIT;
    const key = options.key || DEFAULT_KEY;
    return {
      name: INTEGRATION_NAME9,
      preprocessEvent(event, hint, client) {
        const options2 = client.getOptions();
        applyAggregateErrorsToEvent(
          // This differs from the LinkedErrors integration in core by using a different exceptionFromError function
          exceptionFromError2,
          options2.stackParser,
          key,
          limit,
          event,
          hint
        );
      }
    };
  });
  var linkedErrorsIntegration = defineIntegration(_linkedErrorsIntegration);

  // node_modules/@sentry/browser/build/npm/esm/prod/utils/detectBrowserExtension.js
  function checkAndWarnIfIsEmbeddedBrowserExtension() {
    if (_isEmbeddedBrowserExtension()) {
      if (DEBUG_BUILD3) {
        consoleSandbox(() => {
          console.error(
            "[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/"
          );
        });
      }
      return true;
    }
    return false;
  }
  function _isEmbeddedBrowserExtension() {
    if (typeof WINDOW3.window === "undefined") {
      return false;
    }
    const _window = WINDOW3;
    if (_window.nw) {
      return false;
    }
    const extensionObject = _window["chrome"] || _window["browser"];
    if (!extensionObject?.runtime?.id) {
      return false;
    }
    const href = getLocationHref();
    const isDedicatedExtensionPage = WINDOW3 === WINDOW3.top && /^(?:chrome-extension|moz-extension|ms-browser-extension|safari-web-extension):\/\//.test(href);
    return !isDedicatedExtensionPage;
  }

  // node_modules/@sentry/browser/build/npm/esm/prod/sdk.js
  function getDefaultIntegrations(_options) {
    return [
      // TODO(v11): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
      // eslint-disable-next-line deprecation/deprecation
      inboundFiltersIntegration(),
      functionToStringIntegration(),
      conversationIdIntegration(),
      browserApiErrorsIntegration(),
      breadcrumbsIntegration(),
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      httpContextIntegration(),
      cultureContextIntegration(),
      browserSessionIntegration()
    ];
  }
  function init(options = {}) {
    const shouldDisableBecauseIsBrowserExtenstion = !options.skipBrowserExtensionCheck && checkAndWarnIfIsEmbeddedBrowserExtension();
    let defaultIntegrations = options.defaultIntegrations == null ? getDefaultIntegrations() : options.defaultIntegrations;
    const clientOptions = {
      ...options,
      enabled: shouldDisableBecauseIsBrowserExtenstion ? false : options.enabled,
      stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
      integrations: getIntegrationsToSetup({
        integrations: options.integrations,
        defaultIntegrations
      }),
      transport: options.transport || makeFetchTransport
    };
    return initAndBind(BrowserClient, clientOptions);
  }

  // extension/utils/sentry.js
  var DSN = "https://05571ef5f66316725f1b1f75cbda202d@o4511239109804032.ingest.us.sentry.io/4511239112818688";
  var ENV = "development";
  var RELEASE = void 0;
  var initialized = false;
  function scrubUrl(url) {
    if (typeof url !== "string") return url;
    try {
      const u = new URL(url);
      return `${u.origin}${u.pathname}`;
    } catch {
      return url;
    }
  }
  function initExtensionSentry({ scope } = {}) {
    if (initialized) return;
    if (!DSN) return;
    try {
      init({
        dsn: DSN,
        environment: ENV,
        release: RELEASE,
        // Fix (review #1b): @sentry/browser auto-disables inside browser
        // extensions unless this flag is set. Without it, every event is
        // silently dropped regardless of DSN.
        skipBrowserExtensionCheck: true,
        tracesSampleRate: 0,
        sendDefaultPii: false,
        initialScope: scope ? { tags: { scope } } : void 0,
        beforeSend(event) {
          if (event.request?.url) event.request.url = scrubUrl(event.request.url);
          if (event.request?.cookies) delete event.request.cookies;
          if (event.request?.headers) {
            delete event.request.headers.cookie;
            delete event.request.headers.authorization;
          }
          if (event.extra) {
            for (const k of Object.keys(event.extra)) {
              const v = event.extra[k];
              if (typeof v === "string" && (v.length > 280 || v.includes("\n"))) {
                event.extra[k] = "[redacted]";
              }
            }
          }
          return event;
        }
      });
      initialized = true;
    } catch {
    }
  }
  function setExtensionUser(userId) {
    if (!initialized) return;
    try {
      if (userId) setUser({ id: String(userId) });
      else setUser(null);
    } catch {
    }
  }
  function captureExtensionError(err, context) {
    if (!initialized) return;
    try {
      if (!context) {
        captureException(err);
        return;
      }
      const structured = Object.prototype.hasOwnProperty.call(context, "tags") || Object.prototype.hasOwnProperty.call(context, "extra") || Object.prototype.hasOwnProperty.call(context, "fingerprint");
      if (structured) {
        const { tags, extra, fingerprint, level, contexts } = context;
        const safeTags = tags && typeof tags === "object" && !Array.isArray(tags) ? tags : void 0;
        const safeExtra = extra && typeof extra === "object" && !Array.isArray(extra) ? extra : void 0;
        const safeFingerprint = Array.isArray(fingerprint) ? fingerprint.map((x) => String(x)) : void 0;
        captureException(err, {
          tags: safeTags,
          extra: safeExtra,
          fingerprint: safeFingerprint,
          level,
          contexts
        });
        return;
      }
      captureException(err, { extra: context });
    } catch {
    }
  }

  // extension/utils/auth.js
  var AuthManager = class {
    constructor() {
      this.token = null;
      this.isWhitelisted = false;
      this.authStatusCache = null;
      this.cacheExpiry = 0;
      this.apiClient = null;
      globalThis.__tweetreplyaiExtLoggingAllowed = false;
    }
    setApiClient(apiClient) {
      this.apiClient = apiClient;
    }
    async isAuthenticated(validateWithServer = false) {
      if (!validateWithServer && this.authStatusCache && Date.now() < this.cacheExpiry) {
        return this.authStatusCache;
      }
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getAuthStatus" }, resolve);
        });
        const isAuthenticated = !!response?.authenticated;
        if (isAuthenticated) {
          const tokenResult = await chrome.storage.local.get(["authToken"]);
          this.token = tokenResult.authToken || null;
        } else {
          this.token = null;
        }
        if (!isAuthenticated) {
          this.authStatusCache = false;
          this.cacheExpiry = Date.now() + 3e4;
          this.isWhitelisted = false;
          globalThis.__tweetreplyaiExtLoggingAllowed = false;
          return false;
        }
        if (validateWithServer && this.apiClient) {
          try {
            const user = await this.apiClient.getCurrentUser();
            this.isWhitelisted = !!user?.isWhitelisted;
            globalThis.__tweetreplyaiExtLoggingAllowed = this.isWhitelisted;
            this.authStatusCache = true;
            this.cacheExpiry = Date.now() + 3e4;
            return true;
          } catch (error2) {
            if (error2.message && error2.message.includes("401")) {
              console.log("[Auth] Token validation failed (401), auto-logging out");
              await this.signOut();
              this.authStatusCache = false;
              this.cacheExpiry = Date.now() + 3e4;
              this.isWhitelisted = false;
              globalThis.__tweetreplyaiExtLoggingAllowed = false;
              return false;
            }
            this.authStatusCache = false;
            this.cacheExpiry = Date.now() + 3e4;
            this.isWhitelisted = false;
            globalThis.__tweetreplyaiExtLoggingAllowed = false;
            return false;
          }
        }
        this.authStatusCache = isAuthenticated;
        this.cacheExpiry = Date.now() + 3e4;
        return isAuthenticated;
      } catch (error2) {
        console.error("Failed to check auth status:", error2);
        this.authStatusCache = false;
        this.isWhitelisted = false;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        return false;
      }
    }
    async getToken() {
      if (!this.token) {
        await this.isAuthenticated();
      }
      return this.token;
    }
    async signOut() {
      try {
        this.token = null;
        this.isWhitelisted = false;
        this.authStatusCache = false;
        this.cacheExpiry = 0;
        globalThis.__tweetreplyaiExtLoggingAllowed = false;
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "clearAuth" }, resolve);
        });
        setExtensionUser(null);
        return true;
      } catch (error2) {
        console.error("Failed to sign out:", error2);
        return false;
      }
    }
    async storeToken(token) {
      try {
        this.token = token;
        this.authStatusCache = true;
        this.cacheExpiry = Date.now() + 3e4;
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            action: "storeToken",
            token
          }, resolve);
        });
        return true;
      } catch (error2) {
        console.error("Failed to store token:", error2);
        return false;
      }
    }
    // Clear cache to force re-check
    clearCache() {
      this.authStatusCache = null;
      this.cacheExpiry = 0;
    }
  };

  // extension/config/constants.js
  var APP_DISPLAY_NAME = "TweetReplyAI";
  var API = {
    DEFAULT_DOMAIN: "tweetreplyai.vercel.app",
    LOGIN_URL: "https://tweetreplyai.vercel.app/login",
    TAB_PATTERN: "https://tweetreplyai.vercel.app/*"
  };
  var POLLING = {
    USAGE_REFRESH_MS: 3e4,
    ANALYTICS_REFRESH_MS: 3e4,
    URL_TRACKING_MS: 300,
    TRACKING_CLEANUP_MS: 6e4
  };
  var TIMEOUTS = {
    USAGE_LOAD_MS: 1e4,
    AUTH_SYNC_DELAY_MS: 500,
    DOM_DEBOUNCE_MS: 100,
    BUTTON_THROTTLE_MS: 200,
    PLACEMENT_OBSERVER_MS: 150,
    TELEMETRY_FLUSH_DEBOUNCE_MS: 4e3,
    /** Auto-like: poll interval and max wait after Reply open (bounded retry vs one-shot 50ms). */
    AUTO_LIKE_POLL_MS: 100,
    AUTO_LIKE_MAX_WAIT_MS: 2e3
  };
  var DEFAULTS = {
    ANALYTICS_DAYS: 30,
    TRACKING_DAYS: 7,
    TRACKING_DAYS_MIN: 1,
    TRACKING_DAYS_MAX: 30,
    REPLY_HISTORY_LIMIT: 50,
    TELEMETRY_MAX_BUFFER: 100,
    TELEMETRY_DEDUPE_WINDOW_MS: 1e4,
    SNIPPET_LIBRARY_LIMIT: 20,
    SNIPPET_MAX_LENGTH: 500
  };
  var VALIDATION = {
    MIN_TWEET_LENGTH: 20,
    MAX_TWEET_LENGTH: 500,
    MAX_THREAD_CHAIN: 4,
    MAX_THREAD_CHARS: 2e3
  };
  var AUTH = {
    TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1e3,
    ONE_DAY_MS: 24 * 60 * 60 * 1e3
  };
  var STORAGE = {
    RELATIONSHIP_HINTS_ENABLED: "relationshipHintsEnabled",
    FOLLOW_BADGE_ICON_STYLE: "followBadgeIconStyle"
  };
  var FOLLOW_BADGE_ICON_STYLE = {
    TEXT: "text",
    EMOJI: "emoji",
    ICON_ONLY: "icon_only"
  };
  var FOLLOW_BADGE_ICON_STYLE_DEFAULT = FOLLOW_BADGE_ICON_STYLE.TEXT;
  var FOLLOW_BADGE_ICON_STYLE_VALUES = [
    FOLLOW_BADGE_ICON_STYLE.TEXT,
    FOLLOW_BADGE_ICON_STYLE.EMOJI,
    FOLLOW_BADGE_ICON_STYLE.ICON_ONLY
  ];
  var CTA_STORAGE = {
    TEXT: "tweetreply_cta_text",
    AUTO_APPEND: "tweetreply_cta_auto_append"
  };
  var SNIPPET_STORAGE = {
    LIBRARY: "tweetreply_snippet_library",
    DEFAULT_ID: "tweetreply_snippet_default_id",
    AUTO_APPEND_ID: "tweetreply_snippet_auto_append_id",
    MIGRATED: "tweetreply_snippet_migrated_v1"
  };
  var REUSE = {
    BUTTON_CLASS: "tweetreply-reuse-button",
    BUTTON_TITLE: "Reuse this tweet with AI",
    MODAL_ID: "tweetreply-reuse-modal",
    MODAL_Z_INDEX: 1e5,
    DEFAULT_DEGREE: 50,
    MIN_SOURCE_LEN: 20,
    TWITTER_CHAR_LIMIT: 280,
    LONG_TWEET_CHAR_LIMIT: 4e3,
    COMPOSE_URL_PATH: "/compose/post",
    COMPOSE_POLL_MS: 100,
    COMPOSE_POLL_TIMEOUT_MS: 3e3,
    DEGREE_BANDS: [
      { max: 20, label: "Minimal" },
      { max: 40, label: "Light" },
      { max: 60, label: "Balanced" },
      { max: 80, label: "Heavy" },
      { max: 100, label: "Reimagined" }
    ]
  };

  // extension/utils/api.js
  var ApiClient = class {
    constructor() {
      this.authManager = new AuthManager();
      this.baseUrl = null;
    }
    async getBaseUrl() {
      if (!this.baseUrl) {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "getApiDomain" }, resolve);
        });
        const domain = response.domain || API.DEFAULT_DOMAIN;
        const protocol = domain.includes("localhost") ? "http" : "https";
        this.baseUrl = `${protocol}://${domain}`;
      }
      return this.baseUrl;
    }
    async makeRequest(endpoint, options = {}) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "apiRequest",
            endpoint,
            method: options.method || "GET",
            body: options.body,
            headers: options.headers || {}
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message;
              captureExtensionError(new Error(msg), {
                tags: {
                  endpoint: String(endpoint),
                  surface: "api_client",
                  kind: "runtime_last_error"
                }
              });
              reject(new Error(msg));
              return;
            }
            if (!response) {
              captureExtensionError(new Error("No response from background script"), {
                tags: {
                  endpoint: String(endpoint),
                  surface: "api_client",
                  kind: "empty_response"
                }
              });
              reject(new Error("No response from background script"));
              return;
            }
            if (!response.success) {
              const st = response.status;
              if (response.status === 401) {
                this.authManager.signOut().catch((err) => {
                  console.error("Failed to sign out on 401:", err);
                });
                reject(new Error("401: Unauthorized"));
                return;
              }
              if (response.status === 402) {
                reject(new Error("402: Payment required - quota exceeded"));
                return;
              }
              reject(new Error(`${response.status}: ${response.error}`));
              return;
            }
            resolve(response.data);
          }
        );
      });
    }
    async getCurrentUser() {
      const user = await this.makeRequest("/api/auth/user");
      if (user?.id) setExtensionUser(String(user.id));
      return user;
    }
    async getExtensionAuth() {
      const data = await this.makeRequest("/api/extension/auth");
      if (data?.user?.id) setExtensionUser(String(data.user.id));
      return data;
    }
    async getUsage() {
      return this.makeRequest("/api/usage");
    }
    async generateReply(data) {
      return this.makeRequest("/api/generate-reply", {
        method: "POST",
        body: data
      });
    }
    async createBillingPortal() {
      const response = await this.makeRequest("/api/billing/portal", {
        method: "POST"
      });
      return response.portal_url;
    }
    async submitFeedback(data) {
      return this.makeRequest("/api/feedback", {
        method: "POST",
        body: data
      });
    }
    async getPlans() {
      return this.makeRequest("/api/plans");
    }
    async createCheckout(planCode) {
      return this.makeRequest("/api/checkout", {
        method: "POST",
        body: { plan_code: planCode }
      });
    }
    async getReplyHistory(limit = 50) {
      return this.makeRequest(`/api/reply-history?limit=${limit}`);
    }
    async markReplyAsUsed(id, tweetUrl) {
      return this.makeRequest(`/api/reply-history/${id}/mark-used`, {
        method: "POST",
        body: { tweetUrl }
      });
    }
    async suggestImprovements(draftReply, originalTweet, opts = {}) {
      const body = {
        draft_reply: draftReply,
        original_tweet: originalTweet
      };
      if (opts.model_key) {
        body.model_key = opts.model_key;
      }
      return this.makeRequest("/api/suggest-improvements", {
        method: "POST",
        body
      });
    }
    /**
     * Reuse / Reframe an existing X tweet. Calls POST /api/reframe-tweet.
     * Only `source_tweet` and `degree` are required; the rest are best-effort hints.
     */
    async reframeTweet({
      source_tweet,
      degree,
      source_author,
      source_tweet_url,
      model_key,
      allow_long
    }) {
      return this.makeRequest("/api/reframe-tweet", {
        method: "POST",
        body: {
          source_tweet,
          degree,
          source_author,
          source_tweet_url,
          model_key,
          allow_long
        }
      });
    }
    async getModels() {
      return this.makeRequest("/api/models");
    }
    async getPrompts() {
      return this.makeRequest("/api/prompts");
    }
    async getAnalytics(days = DEFAULTS.ANALYTICS_DAYS) {
      return this.makeRequest(`/api/analytics/feedback-stats?days=${days}`);
    }
    async getQualityMetrics(days = DEFAULTS.ANALYTICS_DAYS) {
      return this.makeRequest(`/api/quality/metrics?days=${days}`);
    }
    async getSimpleAnalytics(days = DEFAULTS.ANALYTICS_DAYS) {
      console.log(`[ApiClient] getSimpleAnalytics called with days=${days}`);
      const result = await this.makeRequest(`/api/analytics/simple?days=${days}`);
      console.log("[ApiClient] getSimpleAnalytics result:", result);
      return result;
    }
    async getFollowerStatus() {
      return this.makeRequest("/api/x-followers/status");
    }
    async getFollowerStats(range = "7d") {
      return this.makeRequest(`/api/x-followers/stats?range=${encodeURIComponent(range)}`);
    }
    async getFollowerEvents(type = "unfollow", sinceDays = 30, limit = 30) {
      const params = new URLSearchParams({
        type,
        sinceDays: String(sinceDays),
        limit: String(limit)
      });
      return this.makeRequest(`/api/x-followers/events?${params.toString()}`);
    }
    startFollowerSync() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "startFollowerSync" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "Failed to start sync"));
            return;
          }
          resolve(response);
        });
      });
    }
  };

  // extension/utils/consoleGate.js
  var GLOBAL_FLAG_KEY = "__tweetreplyaiExtLoggingAllowed";
  var GLOBAL_STATE_KEY = "__tweetreplyaiConsoleGateState";
  function installConsoleGate(getAllowed) {
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
      debug: console.debug.bind(console)
    };
    const sharedState = {
      installed: true,
      getAllowed,
      originals
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
  if (typeof globalThis[GLOBAL_FLAG_KEY] !== "boolean") {
    globalThis[GLOBAL_FLAG_KEY] = false;
  }

  // extension/utils/telemetry.js
  var ALLOWED_EVENT_TYPES = /* @__PURE__ */ new Set([
    "auth_sync_failed",
    "api_request_failed",
    "api_timeout",
    "rate_limited",
    "credits_exhausted",
    "composer_injection_failed",
    "reply_insert_failed",
    "storage_read_failed",
    "storage_write_failed",
    "unknown_runtime_error",
    // Reuse / Reframe tweet feature
    "reuse_open",
    "reuse_generate_success",
    "reuse_generate_error",
    "reuse_post_to_compose",
    "reuse_post_to_compose_timeout"
  ]);
  var ALLOWED_SURFACES = /* @__PURE__ */ new Set(["content", "popup", "background"]);
  var dedupeMap = /* @__PURE__ */ new Map();
  function toSafeString(value, max = 200) {
    if (value === null || value === void 0) return "";
    const v = String(value);
    return v.length > max ? `${v.slice(0, max)}...` : v;
  }
  function normalizeTelemetryEvent(raw = {}) {
    const eventType = ALLOWED_EVENT_TYPES.has(raw.event_type) ? raw.event_type : "unknown_runtime_error";
    const surface = ALLOWED_SURFACES.has(raw.surface) ? raw.surface : "background";
    const extensionVersion = chrome.runtime?.getManifest?.()?.version || "unknown";
    return {
      event_type: eventType,
      timestamp: raw.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      extension_version: extensionVersion,
      surface,
      route: toSafeString(raw.route, 120),
      http_status: Number.isFinite(Number(raw.http_status)) ? Number(raw.http_status) : null,
      error_code: toSafeString(raw.error_code, 120),
      context: {
        model_key: toSafeString(raw?.context?.model_key, 80),
        reply_mode: toSafeString(raw?.context?.reply_mode, 80),
        prompt_key: toSafeString(raw?.context?.prompt_key, 80),
        action: toSafeString(raw?.context?.action, 80),
        note: toSafeString(raw?.context?.note, 160)
      }
    };
  }
  function shouldDedupeEvent(event) {
    const key = [
      event.event_type,
      event.surface,
      event.route || "",
      event.http_status || "",
      event.error_code || ""
    ].join("|");
    const now = Date.now();
    const prev = dedupeMap.get(key);
    if (prev && now - prev < DEFAULTS.TELEMETRY_DEDUPE_WINDOW_MS) return true;
    dedupeMap.set(key, now);
    return false;
  }
  function emitTelemetry(rawEvent) {
    try {
      const event = normalizeTelemetryEvent(rawEvent);
      if (shouldDedupeEvent(event)) return;
      chrome.runtime.sendMessage({ action: "telemetryEvent", event }).catch?.(() => {
      });
    } catch {
    }
  }

  // extension/utils/userFacingErrors.js
  function getUserFacingError(error2, fallback = "Something went wrong. Try again.") {
    const raw = String(error2?.message ?? "").toLowerCase();
    if (raw.includes("401") || raw.includes("unauthorized")) {
      return { message: "Session expired. Please sign in again.", action: "signin" };
    }
    if (raw.includes("402") || raw.includes("quota") || raw.includes("credits")) {
      return { message: "Credits exhausted. Upgrade to continue.", action: "upgrade" };
    }
    if (raw.includes("timeout") || raw.includes("network")) {
      return { message: "Network issue. Please retry.", action: "retry" };
    }
    if (raw.includes("429") || raw.includes("cooldown") || raw.includes("please wait before syncing")) {
      return { message: error2?.message || "Sync cooldown active. Please wait before syncing again.", action: "retry" };
    }
    return { message: fallback, action: "retry" };
  }

  // extension/content/helpers/composer-text.js
  function normalizeComposerText(value) {
    return String(value || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
  }
  function extractCanonicalComposerText(composer) {
    if (!composer) return "";
    const dataTextSpan = composer.querySelector('[data-text="true"]');
    const spanText = normalizeComposerText(dataTextSpan?.textContent || dataTextSpan?.innerText);
    if (spanText) return spanText;
    const contentEditable = composer.querySelector('[contenteditable="true"]');
    if (contentEditable && contentEditable !== composer) {
      const nestedText = normalizeComposerText(contentEditable.innerText || contentEditable.textContent);
      if (nestedText) return nestedText;
    }
    return normalizeComposerText(composer.innerText || composer.textContent);
  }
  function combineReplyAndCta(existingText, ctaText) {
    const existing = normalizeComposerText(existingText);
    const cta = normalizeComposerText(ctaText);
    if (!cta) return existing;
    return existing ? `${existing}

${cta}` : cta;
  }

  // extension/content/helpers/reuse-inject.js
  var DEFAULT_MIN_SOURCE_LEN = 20;
  var DEFAULT_BUTTON_CLASS = "tweetreply-reuse-button";
  var DEFAULT_BUTTON_TITLE = "Reuse this tweet with AI";
  var SHELL_CLASS = "tweetreply-reuse-shell";
  function buildReuseButton({ buttonClass, buttonTitle, onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = buttonClass;
    btn.setAttribute("aria-label", buttonTitle);
    btn.title = buttonTitle;
    btn.dataset.tweetreplyReuse = "1";
    btn.innerHTML = [
      '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="currentColor">',
      '<path d="M17.5 3A4.5 4.5 0 0 1 22 7.5V12h-2V7.5A2.5 2.5 0 0 0 17.5 5H9v2.5L4.5 4 9 .5V3h8.5zM6.5 21A4.5 4.5 0 0 1 2 16.5V12h2v4.5A2.5 2.5 0 0 0 6.5 19H15v-2.5l4.5 3.5L15 23.5V21H6.5z"/>',
      "</svg>"
    ].join("");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }
  function wrapAsActionItem(btn) {
    const shell = document.createElement("div");
    shell.className = SHELL_CLASS;
    shell.appendChild(btn);
    return shell;
  }
  function defaultShowToast(message) {
    try {
      let host = document.getElementById("tweetreply-reuse-toast-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "tweetreply-reuse-toast-host";
        host.style.cssText = [
          "position:fixed",
          "bottom:24px",
          "left:50%",
          "transform:translateX(-50%)",
          "z-index:100001",
          "pointer-events:none"
        ].join(";");
        document.body.appendChild(host);
      }
      const toast = document.createElement("div");
      toast.className = "tweetreply-reuse-toast";
      toast.textContent = message;
      toast.style.cssText = [
        "background:rgba(15,20,25,0.92)",
        "color:#fff",
        "padding:8px 14px",
        "border-radius:9999px",
        "font-size:13px",
        "margin-top:8px",
        "box-shadow:0 4px 12px rgba(0,0,0,0.15)"
      ].join(";");
      host.appendChild(toast);
      setTimeout(() => toast.remove(), 2400);
    } catch {
    }
  }
  function injectReuseButtonsImpl(container, deps) {
    if (!container || !deps) return;
    const {
      injected,
      onClick,
      extractText,
      extractTweetUrl,
      minSourceLen = DEFAULT_MIN_SOURCE_LEN,
      buttonClass = DEFAULT_BUTTON_CLASS,
      buttonTitle = DEFAULT_BUTTON_TITLE,
      showToast = defaultShowToast
    } = deps;
    const root = typeof container.querySelectorAll === "function" ? container : null;
    if (!root) return;
    const descendants = Array.from(root.querySelectorAll('article[data-testid="tweet"]'));
    const rootIsArticle = typeof root.matches === "function" && root.matches('article[data-testid="tweet"]');
    const articles = rootIsArticle ? [root, ...descendants] : descendants;
    articles.forEach((article) => {
      if (injected.has(article)) return;
      if (article.closest('[role="dialog"] [data-testid="tweetComposer"]')) return;
      if (article.querySelector(`.${buttonClass}`)) {
        injected.add(article);
        return;
      }
      const actionGroup = article.querySelector('[role="group"]');
      if (!actionGroup) return;
      const btn = buildReuseButton({
        buttonClass,
        buttonTitle,
        onClick: () => {
          let extracted = null;
          try {
            extracted = extractText(article);
          } catch {
            extracted = null;
          }
          const text = extracted?.text?.trim() || "";
          if (text.length < minSourceLen) {
            showToast("Tweet is too short to reuse.");
            return;
          }
          let tweetUrl;
          try {
            tweetUrl = extractTweetUrl(article);
          } catch {
            tweetUrl = void 0;
          }
          onClick({ text, author: extracted?.author, tweetUrl });
        }
      });
      const shell = wrapAsActionItem(btn);
      const shareAnchor = actionGroup.querySelector('[data-testid="share"]');
      const shareSlot = shareAnchor?.closest("div");
      if (shareSlot && shareSlot.parentNode === actionGroup) {
        actionGroup.insertBefore(shell, shareSlot);
      } else {
        actionGroup.appendChild(shell);
      }
      injected.add(article);
    });
  }

  // extension/content/helpers/model-select.js
  var MODEL_STORAGE_KEY = "tweetreply_model";
  function getModelSelectOptgroupLabel(tierId) {
    if (tierId === "auto") return "Auto";
    if (tierId === "primary") return "Tier 1";
    if (tierId === "secondary") return "Tier 2";
    if (tierId === "tertiary") return "Groq";
    return "Models";
  }
  function populateModelSelectFromUsage(select, selectableModels, savedModelKey) {
    if (!selectableModels || !Array.isArray(selectableModels) || selectableModels.length === 0) {
      const autoOpt = document.createElement("option");
      autoOpt.value = "auto";
      autoOpt.textContent = "Auto";
      select.appendChild(autoOpt);
      select.value = "auto";
      return;
    }
    const groups = /* @__PURE__ */ new Map();
    for (const model of selectableModels) {
      const tierId = model.tierId || "secondary";
      if (!groups.has(tierId)) groups.set(tierId, []);
      groups.get(tierId).push(model);
    }
    const tierOrder = ["auto", "primary", "secondary", "tertiary"];
    for (const tierId of tierOrder) {
      const entries = groups.get(tierId);
      if (!entries?.length) continue;
      const optgroup = document.createElement("optgroup");
      optgroup.label = getModelSelectOptgroupLabel(tierId);
      for (const model of entries) {
        const option = document.createElement("option");
        option.value = model.key;
        option.textContent = model.name;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }
    const options = Array.from(select.querySelectorAll("option"));
    if (savedModelKey && options.some((o) => o.value === savedModelKey)) {
      select.value = savedModelKey;
    } else {
      select.value = "auto";
    }
  }
  function createModelSelectElement({
    selectableModels,
    storageKey = MODEL_STORAGE_KEY,
    className,
    title = "Choose AI model"
  }) {
    const select = document.createElement("select");
    select.className = className;
    select.title = title;
    const applyOptions = (savedModelKey) => {
      select.replaceChildren();
      populateModelSelectFromUsage(select, selectableModels, savedModelKey);
    };
    try {
      const storage = chrome?.storage?.local;
      if (storage?.get) {
        storage.get([storageKey], (data) => {
          const saved = data && typeof data[storageKey] === "string" ? data[storageKey] : "auto";
          applyOptions(saved === "" ? "auto" : saved);
        });
      } else {
        applyOptions("auto");
      }
    } catch (_) {
      applyOptions("auto");
    }
    select.addEventListener("change", () => {
      try {
        chrome?.storage?.local?.set({ [storageKey]: select.value || "auto" });
      } catch (_) {
      }
    });
    return select;
  }

  // extension/content/helpers/reuse-modal.js
  var DEFAULT_BANDS = [
    { max: 20, label: "Minimal" },
    { max: 40, label: "Light" },
    { max: 60, label: "Balanced" },
    { max: 80, label: "Heavy" },
    { max: 100, label: "Reimagined" }
  ];
  function bandLabelFor(degree, bands = DEFAULT_BANDS) {
    const d = Math.max(0, Math.min(100, Number(degree) || 0));
    for (const b of bands) if (d <= b.max) return b.label;
    return bands[bands.length - 1]?.label || "";
  }
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null) continue;
      if (key === "class") el.className = value;
      else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key === "style") el.style.cssText = value;
      else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in el) {
        try {
          el[key] = value;
        } catch {
          el.setAttribute(key, value);
        }
      } else {
        el.setAttribute(key, value);
      }
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      if (typeof child === "string") el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    }
    return el;
  }
  function truncate2(text, max = 260) {
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
  }
  var DEGREE_HINTS = {
    Minimal: "Copy-edit; same idea, light reword",
    Light: "Fresher phrasing; same shape",
    Balanced: "Clearer takeaway; mostly new wording",
    Heavy: "New packaging; same thesis",
    Reimagined: "Fresh angle; core insight only"
  };
  var REUSE_DEGREE_STORAGE_KEY = "tweetreply_reuse_degree";
  var MAX_VARIATIONS = 10;
  function createReuseModal(payload, deps) {
    const {
      apiClient,
      postToCompose,
      onUsageUpdated,
      emitTelemetry: emitTelemetry2,
      getUserFacingError: getUserFacingError2,
      constants,
      loginUrl = "https://tweetreplyai.vercel.app/login",
      usagePicker
    } = deps || {};
    const MODAL_ID = constants?.MODAL_ID || "tweetreply-reuse-modal";
    const BANDS = constants?.DEGREE_BANDS || DEFAULT_BANDS;
    const DEFAULT_DEGREE = constants?.DEFAULT_DEGREE ?? 50;
    const TWITTER_CHAR_LIMIT = constants?.TWITTER_CHAR_LIMIT ?? 280;
    const LONG_TWEET_CHAR_LIMIT = constants?.LONG_TWEET_CHAR_LIMIT ?? 4e3;
    const existing = document.getElementById(MODAL_ID);
    if (existing) {
      existing.focus?.();
      return { element: existing, close: () => {
      } };
    }
    const { text: sourceText = "", author = "", tweetUrl } = payload || {};
    let requestToken = 0;
    let state = "idle";
    let generationHistory = [];
    let selectedId = null;
    let variationSeq = 0;
    const overlay = h("div", {
      id: MODAL_ID,
      class: "tweetreply-reuse-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Reuse tweet",
      tabIndex: "-1"
    });
    const card = h("div", { class: "tweetreply-reuse-card" });
    overlay.appendChild(card);
    const pastSheet = h("div", {
      class: "tweetreply-reuse-past-sheet",
      hidden: true,
      "aria-hidden": "true"
    });
    const pastPanelTitle = h("h3", { id: "tweetreply-reuse-past-title", class: "tweetreply-reuse-past-title" }, "Past variations");
    const pastPanelClose = h("button", {
      type: "button",
      class: "tweetreply-reuse-past-close",
      "aria-label": "Close past variations"
    }, "\xD7");
    const pastList = h("div", { class: "tweetreply-reuse-past-list" });
    const pastListScroll = h("div", { class: "tweetreply-reuse-past-scroll" });
    pastListScroll.appendChild(pastList);
    const pastCapHint = h("div", { class: "tweetreply-reuse-past-cap", hidden: true }, `Showing last ${MAX_VARIATIONS} variations.`);
    const pastPanel = h("div", {
      class: "tweetreply-reuse-past-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "tweetreply-reuse-past-title",
      onclick: (ev) => ev.stopPropagation()
    }, [
      h("div", { class: "tweetreply-reuse-past-header" }, [pastPanelTitle, pastPanelClose]),
      pastListScroll,
      pastCapHint
    ]);
    pastSheet.appendChild(pastPanel);
    overlay.appendChild(pastSheet);
    const closeBtn = h("button", {
      type: "button",
      class: "tweetreply-reuse-close",
      "aria-label": "Close",
      onclick: () => handle.close()
    }, "\xD7");
    card.appendChild(h("header", { class: "tweetreply-reuse-header" }, [
      h("h2", { class: "tweetreply-reuse-title" }, "Reuse tweet"),
      closeBtn
    ]));
    const preview = h("div", { class: "tweetreply-reuse-preview" });
    if (author) {
      preview.appendChild(h("div", { class: "tweetreply-reuse-author" }, `@${String(author).replace(/^@/, "")}`));
    }
    const previewBody = h("div", { class: "tweetreply-reuse-preview-body" });
    const previewShortText = truncate2(sourceText, 260);
    const previewFullText = sourceText || "";
    previewBody.textContent = previewShortText;
    preview.appendChild(previewBody);
    if (previewFullText.length > 260) {
      let expanded = false;
      const moreBtn = h("button", {
        type: "button",
        class: "tweetreply-reuse-show-more",
        onclick: () => {
          expanded = !expanded;
          previewBody.textContent = expanded ? previewFullText : previewShortText;
          moreBtn.textContent = expanded ? "Show less" : "Show more";
        }
      }, "Show more");
      preview.appendChild(moreBtn);
    }
    card.appendChild(preview);
    let modelSelectEl = null;
    if (usagePicker?.showModelSelect) {
      modelSelectEl = createModelSelectElement({
        selectableModels: usagePicker.selectableModels ?? null,
        className: "tweetreply-reuse-model-select",
        title: "Choose AI model"
      });
      card.appendChild(h("label", { class: "tweetreply-reuse-field" }, [
        h("div", { class: "tweetreply-reuse-field-label" }, "AI model"),
        modelSelectEl
      ]));
    }
    const slider = h("input", {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(DEFAULT_DEGREE),
      class: "tweetreply-reuse-slider",
      "aria-label": "Degree of change"
    });
    const sliderValue = h("span", { class: "tweetreply-reuse-degree-value" }, `${DEFAULT_DEGREE}`);
    const sliderLabel = h("span", { class: "tweetreply-reuse-degree-band" }, bandLabelFor(DEFAULT_DEGREE, BANDS));
    const degreeHint = h("div", { class: "tweetreply-reuse-degree-hint" }, DEGREE_HINTS.Balanced);
    slider.addEventListener("input", () => {
      const d = Number(slider.value) || 0;
      sliderValue.textContent = String(d);
      const label = bandLabelFor(d, BANDS);
      sliderLabel.textContent = label;
      degreeHint.textContent = DEGREE_HINTS[label] || "";
      try {
        chrome?.storage?.local?.set?.({ [REUSE_DEGREE_STORAGE_KEY]: d });
      } catch {
      }
    });
    card.appendChild(h("label", { class: "tweetreply-reuse-field" }, [
      h("div", { class: "tweetreply-reuse-field-label" }, [
        h("span", {}, "Degree of change"),
        h("span", { class: "tweetreply-reuse-degree-readout" }, [sliderValue, " \xB7 ", sliderLabel])
      ]),
      slider,
      degreeHint
    ]));
    try {
      chrome?.storage?.local?.get?.([REUSE_DEGREE_STORAGE_KEY], (result) => {
        const saved = Number(result?.[REUSE_DEGREE_STORAGE_KEY]);
        if (!Number.isFinite(saved) || saved < 0 || saved > 100) return;
        slider.value = String(saved);
        sliderValue.textContent = String(saved);
        const label = bandLabelFor(saved, BANDS);
        sliderLabel.textContent = label;
        degreeHint.textContent = DEGREE_HINTS[label] || "";
      });
    } catch {
    }
    const allowLongCheckbox = h("input", { type: "checkbox", class: "tweetreply-reuse-allow-long" });
    card.appendChild(h("label", { class: "tweetreply-reuse-field tweetreply-reuse-inline" }, [
      allowLongCheckbox,
      h("span", {}, [
        h("span", { class: "tweetreply-reuse-allow-long-label" }, "Allow long tweet (X Premium)"),
        h(
          "span",
          { class: "tweetreply-reuse-hint" },
          ` Requires X Premium to post tweets longer than ${TWITTER_CHAR_LIMIT} characters.`
        )
      ])
    ]));
    const resultTextarea = h("textarea", {
      class: "tweetreply-reuse-result",
      readOnly: true,
      rows: "6",
      placeholder: "The reframed tweet will appear here after Generate."
    });
    const qualityChip = h("span", { class: "tweetreply-reuse-quality", hidden: true });
    const originalityChip = h("span", { class: "tweetreply-reuse-originality", hidden: true });
    const safetyBadge = h("span", { class: "tweetreply-reuse-safety", hidden: true }, "Safety rewrite");
    const errorBox = h("div", { class: "tweetreply-reuse-error", hidden: true, role: "alert" });
    const pastVariationsBtn = h("button", {
      type: "button",
      class: "tweetreply-reuse-past-variations-btn",
      hidden: true
    }, "Past variations");
    card.appendChild(h("div", { class: "tweetreply-reuse-result-wrap" }, [
      h("div", { class: "tweetreply-reuse-result-header" }, [qualityChip, originalityChip, safetyBadge]),
      pastVariationsBtn,
      resultTextarea,
      errorBox
    ]));
    const generateBtn = h("button", { type: "button", class: "tweetreply-reuse-generate" }, "Generate");
    const regenerateBtn = h("button", { type: "button", class: "tweetreply-reuse-regenerate", hidden: true }, "Regenerate");
    const copyBtn = h("button", { type: "button", class: "tweetreply-reuse-copy", disabled: true }, "Copy");
    const postBtn = h("button", { type: "button", class: "tweetreply-reuse-post", disabled: true }, "Post to X");
    card.appendChild(h("footer", { class: "tweetreply-reuse-footer" }, [
      generateBtn,
      regenerateBtn,
      copyBtn,
      postBtn
    ]));
    function newVariationId() {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      variationSeq += 1;
      return `reuse-var-${variationSeq}`;
    }
    function buildVariationEntry(res, { degree }) {
      const safety = res?.meta?.safetyOutcome === "violation_friendly_reply" ? "violation_friendly_reply" : null;
      return {
        id: newVariationId(),
        reframed: res?.reframed || "",
        qualityScore: res?.qualityScore || 0,
        originalityScore: res?.originalityScore ?? res?.meta?.originalityScore ?? 0,
        degree: res?.degree ?? degree,
        band: res?.band,
        safetyOutcome: safety,
        createdAt: Date.now()
      };
    }
    function getSelected() {
      return generationHistory.find((e) => e.id === selectedId) ?? null;
    }
    function trimHistoryIfNeeded() {
      while (generationHistory.length > MAX_VARIATIONS) {
        const removed = generationHistory.shift();
        if (removed?.id === selectedId) {
          selectedId = generationHistory.length ? generationHistory[generationHistory.length - 1].id : null;
        }
      }
      if (selectedId && !generationHistory.some((e) => e.id === selectedId)) {
        selectedId = generationHistory[generationHistory.length - 1]?.id ?? null;
      }
    }
    function selectPastVariation(entry, idxFromNew) {
      selectedId = entry.id;
      applyResultChrome();
      closePastVariationsPanel();
      emitTelemetry2?.({
        event_type: "reuse_variation_select",
        surface: "content",
        context: { action: `index:${idxFromNew}`, note: `historyLen=${generationHistory.length}` }
      });
    }
    function renderPastVariationsList() {
      pastList.replaceChildren();
      if (generationHistory.length === 0) {
        pastList.appendChild(h("div", { class: "tweetreply-reuse-past-empty" }, "No variations yet."));
        pastCapHint.hidden = true;
        return;
      }
      pastCapHint.hidden = generationHistory.length < MAX_VARIATIONS;
      const reversed = [...generationHistory].reverse();
      reversed.forEach((entry, idxFromNew) => {
        const metaLine = [
          new Date(entry.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
          `Q ${Math.round(entry.qualityScore || 0)}`,
          // Review fix: show O chip even when score is 0 (falsy check hid valid scores).
          entry.originalityScore != null ? `O ${Math.round(entry.originalityScore)}` : null
        ].filter(Boolean).join(" \xB7 ");
        const meta = h("div", { class: "tweetreply-reuse-past-meta" }, metaLine);
        const preview2 = h("div", { class: "tweetreply-reuse-past-preview" }, truncate2(entry.reframed, 200));
        const useBtn = h("button", { type: "button", class: "tweetreply-reuse-past-use-btn" }, "Use this");
        useBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          selectPastVariation(entry, idxFromNew);
        });
        const row = h("div", {
          class: `tweetreply-reuse-past-row${entry.id === selectedId ? " tweetreply-reuse-past-row--selected" : ""}`
        });
        row.appendChild(meta);
        row.appendChild(preview2);
        row.appendChild(useBtn);
        row.addEventListener("click", (ev) => {
          if (ev.target instanceof HTMLElement && ev.target.closest("button")) return;
          selectPastVariation(entry, idxFromNew);
        });
        pastList.appendChild(row);
      });
    }
    function openPastVariationsPanel() {
      if (generationHistory.length === 0 || state === "generating") return;
      pastSheet.hidden = false;
      pastSheet.setAttribute("aria-hidden", "false");
      renderPastVariationsList();
      requestAnimationFrame(() => pastPanelClose.focus());
      emitTelemetry2?.({
        event_type: "reuse_past_variations_open",
        surface: "content",
        context: { action: "open", note: `count=${generationHistory.length}` }
      });
    }
    function closePastVariationsPanel() {
      if (pastSheet.hidden) return;
      pastSheet.hidden = true;
      pastSheet.setAttribute("aria-hidden", "true");
      pastVariationsBtn.focus();
    }
    pastSheet.addEventListener("click", (ev) => {
      if (ev.target === pastSheet) closePastVariationsPanel();
    });
    pastPanelClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closePastVariationsPanel();
    });
    pastVariationsBtn.addEventListener("click", () => {
      if (state === "generating") return;
      openPastVariationsPanel();
    });
    function updatePastVariationsButton() {
      const n = generationHistory.length;
      if (n === 0) {
        pastVariationsBtn.hidden = true;
        return;
      }
      pastVariationsBtn.hidden = false;
      pastVariationsBtn.textContent = `Past variations (${n})`;
      pastVariationsBtn.disabled = state === "generating";
    }
    function applyResultChrome() {
      const sel = getSelected();
      if (!sel) {
        qualityChip.hidden = true;
        originalityChip.hidden = true;
        safetyBadge.hidden = true;
        resultTextarea.value = "";
        copyBtn.disabled = true;
        postBtn.disabled = true;
        return;
      }
      qualityChip.hidden = false;
      qualityChip.textContent = `Quality ${Math.round(sel.qualityScore || 0)}`;
      if (sel.originalityScore != null) {
        originalityChip.hidden = false;
        originalityChip.textContent = `Originality ${Math.round(sel.originalityScore)}`;
      } else {
        originalityChip.hidden = true;
      }
      safetyBadge.hidden = !sel.safetyOutcome;
      resultTextarea.value = sel.reframed;
      copyBtn.disabled = false;
      postBtn.disabled = Boolean(sel.safetyOutcome);
    }
    function setState(next, { error: error2 } = {}) {
      state = next;
      if (state === "generating") {
        errorBox.hidden = true;
        generateBtn.textContent = "Generating\u2026";
        regenerateBtn.textContent = "Generating\u2026";
        copyBtn.disabled = true;
        postBtn.disabled = true;
      } else {
        generateBtn.textContent = "Generate";
        regenerateBtn.textContent = "Regenerate";
      }
      if (state === "result") {
        regenerateBtn.hidden = generationHistory.length === 0;
        applyResultChrome();
      }
      if (state === "error" && error2) {
        errorBox.hidden = false;
        errorBox.innerHTML = "";
        errorBox.appendChild(h("span", {}, error2.message || "Something went wrong."));
        if (error2.action === "upgrade") {
          errorBox.appendChild(h("a", {
            href: loginUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "tweetreply-reuse-upgrade"
          }, "Upgrade"));
        }
        if (generationHistory.length > 0 && getSelected()) {
          applyResultChrome();
        } else {
          copyBtn.disabled = true;
          postBtn.disabled = true;
        }
      }
      updatePastVariationsButton();
      if (!pastSheet.hidden) renderPastVariationsList();
    }
    async function runGenerate() {
      const degree = Number(slider.value) || DEFAULT_DEGREE;
      const allowLong = Boolean(allowLongCheckbox.checked);
      const token = ++requestToken;
      setState("generating");
      const charLimit = allowLong ? LONG_TWEET_CHAR_LIMIT : TWITTER_CHAR_LIMIT;
      const startedAt = Date.now();
      try {
        const modelKey = modelSelectEl?.value || "auto";
        const res = await apiClient.reframeTweet({
          source_tweet: sourceText,
          degree,
          source_author: author || void 0,
          source_tweet_url: tweetUrl,
          allow_long: allowLong,
          ...modelKey !== "auto" ? { model_key: modelKey } : {}
        });
        if (token !== requestToken) return;
        const entry = buildVariationEntry(res, { degree });
        generationHistory.push(entry);
        trimHistoryIfNeeded();
        selectedId = entry.id;
        setState("result");
        onUsageUpdated?.();
        emitTelemetry2?.({
          event_type: "reuse_generate_success",
          surface: "content",
          context: {
            action: `degree:${entry.degree}`,
            note: `band=${entry.band || ""};chars=${entry.reframed.length};charLimit=${charLimit};latency=${Date.now() - startedAt}`
          }
        });
      } catch (err) {
        if (token !== requestToken) return;
        const msg = String(err?.message || "");
        if (/^5\d\d:/.test(msg) || msg.includes("No response from background") || msg.includes("runtime.lastError")) {
          captureExtensionError(err instanceof Error ? err : new Error(msg), {
            surface: "reuse_modal",
            phase: "reframe_generate"
          });
        }
        const ufe = getUserFacingError2 ? getUserFacingError2(err, "Failed to reframe tweet. Try again.") : { message: "Failed to reframe tweet. Try again.", action: "retry" };
        emitTelemetry2?.({
          event_type: "reuse_generate_error",
          surface: "content",
          error_code: String(err?.message || "reuse_generate_error").slice(0, 120),
          context: { action: ufe.action, note: `degree=${degree}` }
        });
        if (ufe.action === "signin") {
          handle.close();
          return;
        }
        setState("error", { error: ufe });
      }
    }
    generateBtn.addEventListener("click", runGenerate);
    regenerateBtn.addEventListener("click", runGenerate);
    copyBtn.addEventListener("click", async () => {
      const sel = getSelected();
      if (!sel?.reframed) return;
      try {
        await navigator.clipboard.writeText(sel.reframed);
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1500);
      } catch {
        resultTextarea.removeAttribute("readonly");
        resultTextarea.focus();
        resultTextarea.select();
        copyBtn.textContent = "Copy manually";
      }
    });
    postBtn.addEventListener("click", async () => {
      const sel = getSelected();
      if (!sel?.reframed || sel.safetyOutcome) return;
      postBtn.disabled = true;
      postBtn.textContent = "Opening\u2026";
      ignoreNextPopState = 1;
      try {
        await postToCompose(sel.reframed);
        handle.close();
      } catch (err) {
        setState("error", {
          error: { message: err?.message || "Could not open the compose box.", action: "retry" }
        });
      } finally {
        ignoreNextPopState = 0;
        postBtn.textContent = "Post to X";
        postBtn.disabled = Boolean(getSelected()?.safetyOutcome);
      }
    });
    const onKeydown = (ev) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      if (!pastSheet.hidden) {
        closePastVariationsPanel();
        return;
      }
      handle.close();
    };
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) handle.close();
    });
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("popstate", onPopState, true);
    let ignoreNextPopState = 0;
    function onPopState() {
      if (ignoreNextPopState > 0) {
        ignoreNextPopState--;
        return;
      }
      requestToken++;
      handle.close();
    }
    emitTelemetry2?.({
      event_type: "reuse_open",
      surface: "content",
      context: { action: "modal_open", note: `sourceLen=${sourceText.length}` }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.focus?.());
    const handle = {
      element: overlay,
      close() {
        requestToken++;
        document.removeEventListener("keydown", onKeydown, true);
        window.removeEventListener("popstate", onPopState, true);
        overlay.remove();
      },
      // For tests: let callers trigger a generate without clicking.
      _runGenerate: runGenerate
    };
    return handle;
  }

  // extension/content/helpers/post-to-compose.js
  async function postReframedToComposeImpl(text, deps) {
    const {
      insertText,
      emitTelemetry: emitTelemetry2,
      clipboardWrite,
      sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
      now = () => Date.now(),
      config
    } = deps || {};
    if (!config || typeof insertText !== "function") {
      throw new Error("postReframedToCompose: missing deps");
    }
    const composePath = config.composePath || "/compose/post";
    if (!window.location.pathname.startsWith("/compose/")) {
      try {
        history.pushState({}, "", composePath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
      }
    }
    const started = now();
    while (now() - started < config.timeoutMs) {
      const dialog = document.querySelector('[role="dialog"]');
      const textArea = dialog?.querySelector('[data-testid="tweetTextarea_0"]');
      const toolbar = dialog?.querySelector('[data-testid="toolBar"]');
      if (textArea && toolbar) {
        await insertText(textArea, toolbar, text);
        emitTelemetry2?.({
          event_type: "reuse_post_to_compose",
          surface: "content",
          context: { action: "insert", note: `chars=${text.length}` }
        });
        return true;
      }
      await sleep(config.pollMs);
    }
    emitTelemetry2?.({
      event_type: "reuse_post_to_compose_timeout",
      surface: "content",
      context: { action: "timeout", note: `chars=${text.length}` }
    });
    const writeClipboard = clipboardWrite || (typeof navigator !== "undefined" && navigator.clipboard?.writeText ? (s) => navigator.clipboard.writeText(s) : null);
    if (writeClipboard) {
      try {
        await writeClipboard(text);
      } catch {
      }
    }
    throw new Error("Compose box did not open in time. Reframed text copied to clipboard.");
  }

  // extension/content/helpers/tweet-text-extract.js
  var BLOCK_TAGS = /* @__PURE__ */ new Set(["DIV", "P", "LI", "BLOCKQUOTE"]);
  function isBlockElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName;
    if (BLOCK_TAGS.has(tag)) return true;
    const display = typeof window !== "undefined" && window.getComputedStyle ? window.getComputedStyle(node).display : "";
    return display === "block" || display === "list-item";
  }
  function normalizeExtractedText(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t\f\v]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function extractTweetPlainText(tweetTextEl) {
    if (!tweetTextEl) return "";
    const parts = [];
    let lineBuffer = "";
    const flushLine = () => {
      const trimmed = lineBuffer.replace(/[ \t]+/g, " ").trim();
      if (trimmed) parts.push(trimmed);
      lineBuffer = "";
    };
    const walk = (node, afterBlock = false) => {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        lineBuffer += node.textContent || "";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = (
        /** @type {Element} */
        node
      );
      const tag = el.tagName;
      if (tag === "BR") {
        if (!lineBuffer.trim() && parts.length > 0 && parts[parts.length - 1] !== "") {
          parts.push("");
        } else {
          flushLine();
        }
        return;
      }
      if (tag === "IMG" || tag === "VIDEO") {
        return;
      }
      const block = isBlockElement(el);
      if (block && lineBuffer.trim()) {
        flushLine();
      }
      for (const child of Array.from(el.childNodes)) {
        walk(child, false);
      }
      if (block || afterBlock) {
        flushLine();
      }
    };
    walk(tweetTextEl);
    if (lineBuffer.trim()) {
      flushLine();
    }
    const joined = parts.join("\n");
    return normalizeExtractedText(joined);
  }

  // extension/content/helpers/draft-blocks.js
  function buildDraftBlocksFragment(text, keyPrefix = "trai") {
    const fragment = document.createDocumentFragment();
    const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, index) => {
      const block = document.createElement("div");
      block.setAttribute("data-block", "true");
      block.className = "public-DraftStyleDefault-block public-DraftStyleDefault-ltr";
      const offsetSpan = document.createElement("span");
      offsetSpan.setAttribute("data-offset-key", `${keyPrefix}-${index}-0`);
      const textSpan = document.createElement("span");
      textSpan.dataset.text = "true";
      textSpan.textContent = line;
      offsetSpan.appendChild(textSpan);
      block.appendChild(offsetSpan);
      fragment.appendChild(block);
    });
    if (lines.length === 0) {
      const block = document.createElement("div");
      block.setAttribute("data-block", "true");
      block.className = "public-DraftStyleDefault-block public-DraftStyleDefault-ltr";
      const offsetSpan = document.createElement("span");
      offsetSpan.setAttribute("data-offset-key", `${keyPrefix}-0-0`);
      const textSpan = document.createElement("span");
      textSpan.dataset.text = "true";
      offsetSpan.appendChild(textSpan);
      block.appendChild(offsetSpan);
      fragment.appendChild(block);
    }
    return fragment;
  }
  function writeDraftBlocksToContentRoot(contentRoot, text, keyPrefix = "trai") {
    if (!contentRoot) return;
    contentRoot.replaceChildren(buildDraftBlocksFragment(text, keyPrefix));
  }

  // extension/content/content.js
  initExtensionSentry({ scope: "content" });
  globalThis.__tweetreplyaiExtLoggingAllowed = false;
  installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);
  var DIAGNOSE_THREAD_SELECTION = true;
  var TwitterReplyInjector = class {
    constructor() {
      if (window.__tweetReplyInjector) {
        const existing = window.__tweetReplyInjector;
        if (document.readyState === "complete" && !existing.initialized) {
          existing.initialize();
          existing.initialized = true;
        }
        return existing;
      }
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.isAuthenticated = false;
      this.usageData = null;
      this.injectedButtons = /* @__PURE__ */ new Set();
      this.injectedContainers = /* @__PURE__ */ new Set();
      this.injectedReuseButtons = /* @__PURE__ */ new WeakSet();
      this._reuseModal = null;
      this.followStatusByUser = /* @__PURE__ */ new Map();
      this.followBadgeRefreshTimer = null;
      this.followStatusMessageHandler = null;
      this.relationshipHintsEnabled = true;
      this.followBadgeIconStyle = FOLLOW_BADGE_ICON_STYLE_DEFAULT;
      this.currentReplyTargetArticle = null;
      this._replyTargetClearTimer = null;
      this.autoLikeEnabled = true;
      this.pendingReplyTarget = null;
      this._originalTweetCache = null;
      this.lastNonComposePath = window.location.pathname;
      this.urlTrackingInterval = setInterval(() => {
        const path = window.location.pathname;
        if (!/\/compose\//.test(path)) {
          this.lastNonComposePath = path;
        }
        this.tryEagerCacheOriginalTweet();
      }, POLLING.URL_TRACKING_MS);
      window.__tweetReplyInjector = this;
      this.beforeUnloadHandler = () => this.destroy();
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
      this.initialized = false;
      this.initialize();
      this.initialized = true;
    }
    // Helper to get React Fiber node from DOM element
    getReactInstance(element) {
      for (const key in element) {
        if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
          return element[key];
        }
      }
      return element._reactInternalFiber || element._reactInternalInstance || null;
    }
    // Helper to find React component from fiber
    getReactComponent(fiber) {
      if (!fiber) return null;
      let node = fiber;
      while (node) {
        if (node.stateNode && node.stateNode.forceUpdate) {
          return node.stateNode;
        }
        node = node.return;
      }
      return null;
    }
    // Sleep helper method
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // Strip reply prefixes from generated text (based on inject.js)
    stripReplyPrefix(text) {
      const prefixes = [
        "Question",
        "Supportive",
        "Disagree",
        "Enhance",
        "Smart",
        "Controversial",
        "Marketing",
        "Product-marketing"
      ];
      let cleaned = text.trim();
      for (const prefix of prefixes) {
        const regex = new RegExp(`^\\b${prefix}\\b\\s*[^\\w\\s]*\\s*`, "i");
        if (regex.test(cleaned)) {
          cleaned = cleaned.replace(regex, "").trim();
          break;
        }
      }
      const punctuationRegex = /^([A-Z][a-z]+)([\-:.,!]+)\s+/;
      if (punctuationRegex.test(cleaned) && !cleaned.match(/^[A-Za-z]+,\s/)) {
        cleaned = cleaned.replace(punctuationRegex, "").trim();
      }
      return cleaned;
    }
    // Find closest text area to a button element (based on inject.js)
    findClosestTextArea(buttonElement) {
      console.log("[TweetReplyAI] \u{1F50D} Finding closest text area to button...");
      const textAreaSelectors = [
        'div[data-testid="tweetTextarea_0"]',
        'div[data-testid="tweetTextarea_1"]',
        'div[data-testid="tweetTextarea_2"]',
        'div.public-DraftEditor-content[contenteditable="true"]',
        "div.DraftEditor-root textarea",
        'div[data-testid="reply-to-tweet"] div[contenteditable="true"]'
      ];
      let closestElement = null;
      let closestDistance = Infinity;
      for (const selector of textAreaSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const buttonRect = buttonElement.getBoundingClientRect();
          for (const element of Array.from(elements)) {
            const elementRect = element.getBoundingClientRect();
            const distance = Math.abs(elementRect.top - buttonRect.top);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestElement = element;
            }
          }
        }
      }
      if (closestElement) {
        console.log("[TweetReplyAI] \u2705 Found closest text area:", closestElement.tagName, closestElement.className);
      } else {
        console.warn("[TweetReplyAI] \u274C No text area found");
      }
      return closestElement;
    }
    // Find Twitter text area within an element
    findTwitterTextArea(element) {
      const textArea = element.querySelector('div[data-testid^="tweetTextarea_"][role="textbox"]');
      return textArea || (element.parentElement ? this.findTwitterTextArea(element.parentElement) : null);
    }
    getComposerRequestKey(composer) {
      if (!composer) return "unknown";
      if (!composer.dataset.tweetreplyComposerKey) {
        composer.dataset.tweetreplyComposerKey = `trai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      }
      return composer.dataset.tweetreplyComposerKey;
    }
    nextComposerRequestVersion(composer, kind) {
      const mapKey = `${kind}:${this.getComposerRequestKey(composer)}`;
      const next = (this.composerRequestVersions.get(mapKey) || 0) + 1;
      this.composerRequestVersions.set(mapKey, next);
      return next;
    }
    isLatestComposerRequest(composer, kind, version) {
      const mapKey = `${kind}:${this.getComposerRequestKey(composer)}`;
      return this.composerRequestVersions.get(mapKey) === version;
    }
    getScopedTwitterInsertionTargets(composer) {
      const textAreaSelector = 'div[data-testid^="tweetTextarea_"][role="textbox"]';
      const textArea = composer.matches?.(textAreaSelector) ? composer : composer.querySelector?.(textAreaSelector) || composer.closest?.(textAreaSelector);
      const scopeRoot = composer.closest?.('[role="dialog"], [data-testid="tweetComposer"], article') || composer.parentElement || document.body;
      const toolbar = scopeRoot.querySelector?.('[data-testid="toolBar"]') || composer.closest?.('[data-testid="toolBar"]');
      return { textArea, toolbar };
    }
    async insertTextTwitterMethod(textArea, composer, text) {
      console.log("[TRAI] insertTextTwitterMethod \u2014 connected:", textArea?.isConnected, "len:", text?.length);
      try {
        composer?.click?.();
      } catch {
      }
      try {
        textArea?.focus?.();
      } catch {
      }
      await this.sleep(20);
      try {
        const markerId = "trai-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        textArea.dataset.traiMarker = markerId;
        const result = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve({ success: false, reason: "timeout" });
          }, 3e3);
          function handler(event) {
            if (event.data?.type === "TRAI_INSERT_TEXT_RESULT" && event.data?.markerId === markerId) {
              clearTimeout(timeout);
              window.removeEventListener("message", handler);
              resolve(event.data);
            }
          }
          window.addEventListener("message", handler);
          window.postMessage({ type: "TRAI_INSERT_TEXT", text, markerId }, "*");
        });
        delete textArea.dataset.traiMarker;
        if (result.success) {
          await this.sleep(100);
          console.log("[TRAI] React fiber insert done via MAIN world");
          return;
        }
        console.warn("[TRAI] MAIN world fiber insert failed:", result.reason, "hops:", result.hops);
      } catch (e) {
        console.warn("[TRAI] postMessage fiber approach threw:", e);
      }
      const contentRoot = textArea?.querySelector?.('[data-contents="true"]');
      if (contentRoot) {
        writeDraftBlocksToContentRoot(contentRoot, text);
        return;
      }
      const span = document.createElement("span");
      span.dataset.text = "true";
      span.textContent = text;
      if (typeof textArea?.replaceChildren === "function") {
        textArea.replaceChildren(span);
      }
    }
    extractComposerPlainText(composer) {
      return extractCanonicalComposerText(composer);
    }
    async appendCtaSnippetToComposer(composer, snippet) {
      const trimmed = String(snippet || "").trim();
      if (!trimmed) {
        this.showMessage(composer, "Set your CTA in extension Settings", "info");
        return;
      }
      const existing = this.extractComposerPlainText(composer);
      const combined = combineReplyAndCta(existing, trimmed);
      try {
        await this.insertReplyIntoComposer(composer, combined);
      } catch (error2) {
        emitTelemetry({
          event_type: "reply_insert_failed",
          surface: "content",
          error_code: error2?.message || "append_snippet_failed",
          context: { action: "append_snippet" }
        });
        throw error2;
      }
    }
    async getSnippetLibraryState() {
      const r = await chrome.storage.local.get([
        SNIPPET_STORAGE.LIBRARY,
        SNIPPET_STORAGE.DEFAULT_ID,
        SNIPPET_STORAGE.AUTO_APPEND_ID,
        CTA_STORAGE.TEXT,
        CTA_STORAGE.AUTO_APPEND
      ]);
      const library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
      const byId = new Map(library.map((s) => [s.id, s]));
      const defaultSnippet = byId.get(r[SNIPPET_STORAGE.DEFAULT_ID] || "");
      const autoSnippet = byId.get(r[SNIPPET_STORAGE.AUTO_APPEND_ID] || "");
      const legacyText = typeof r[CTA_STORAGE.TEXT] === "string" ? r[CTA_STORAGE.TEXT].trim() : "";
      return { defaultSnippet, autoSnippet, legacyText, legacyAutoAppend: r[CTA_STORAGE.AUTO_APPEND] === true };
    }
    async maybeAutoAppendCtaAfterAiInsert(composer) {
      const { autoSnippet, legacyText, legacyAutoAppend } = await this.getSnippetLibraryState();
      if (autoSnippet?.text) {
        await this.appendCtaSnippetToComposer(composer, String(autoSnippet.text));
        return;
      }
      if (legacyAutoAppend && legacyText) {
        await this.appendCtaSnippetToComposer(composer, legacyText);
      }
    }
    // Auto-like functionality
    async isAutoLikeEnabled() {
      try {
        const result = await chrome.storage.local.get(["tweetreply_auto_like"]);
        return result.tweetreply_auto_like !== false;
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to check auto-like setting:", error2);
        return true;
      }
    }
    findTweetArticle(element) {
      if (!element) return null;
      let current = element;
      let depth = 0;
      while (current && depth < 10) {
        if (current.tagName === "ARTICLE" && (current.getAttribute("data-testid") === "tweet" || current.querySelector('[data-testid="tweet"]'))) {
          return current.getAttribute("data-testid") === "tweet" ? current : current.querySelector('[data-testid="tweet"]')?.closest("article") || current;
        }
        current = current.parentElement;
        depth++;
      }
      const article = element.closest("article");
      return article || null;
    }
    getTweetIdFromArticle(tweetArticle) {
      if (!tweetArticle) return null;
      const id = tweetArticle.getAttribute("data-tweet-id");
      if (id) return id;
      const ariaLabel = tweetArticle.getAttribute("aria-labelledby");
      if (ariaLabel) {
        const match = ariaLabel.match(/(\d{15,})/);
        if (match) return match[1];
      }
      const link = tweetArticle.querySelector('a[href*="/status/"]');
      if (link && link.href) {
        const linkMatch = link.href.match(/status\/(\d+)/);
        if (linkMatch) return linkMatch[1];
      }
      return null;
    }
    findLikeButton(tweetArticle) {
      if (!tweetArticle) return null;
      const isAlreadyLikedOrUnlike = (btn) => {
        if (!btn) return true;
        if (btn.getAttribute("data-testid") === "unlike") return true;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (label.includes("unlike")) return true;
        if (btn.getAttribute("aria-pressed") === "true") return true;
        return false;
      };
      let likeBtn = tweetArticle.querySelector('[data-testid="like"]');
      if (likeBtn) {
        const isLiked = !!tweetArticle.querySelector('[data-testid="unlike"]') || likeBtn.getAttribute("aria-pressed") === "true";
        if (isLiked) return null;
        if (isAlreadyLikedOrUnlike(likeBtn)) return null;
        return likeBtn;
      }
      const buttons = tweetArticle.querySelectorAll('button[aria-label*="Like" i], [role="button"][aria-label*="Like" i]');
      for (const btn of buttons) {
        const ariaLabel = btn.getAttribute("aria-label") || "";
        if (/like/i.test(ariaLabel) && !/unlike/i.test(ariaLabel)) {
          const isLiked = btn.getAttribute("aria-pressed") === "true" || btn.querySelector('[data-testid="unlike"]');
          if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
        }
      }
      const heartButtons = tweetArticle.querySelectorAll('button, [role="button"]');
      for (const btn of heartButtons) {
        const hasHeartIcon = btn.querySelector('svg path[d*="M12"]') || btn.querySelector('[class*="heart"]') || btn.innerHTML.includes("M20.884 13.19");
        if (hasHeartIcon) {
          const isLiked = btn.getAttribute("aria-pressed") === "true" || btn.querySelector('[data-testid="unlike"]') || btn.classList.contains("liked");
          if (!isLiked && !isAlreadyLikedOrUnlike(btn)) return btn;
        }
      }
      return null;
    }
    async performAutoLike(likeButton) {
      if (!likeButton) return false;
      try {
        likeButton.click();
        await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
        return true;
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to auto-like:", error2);
        try {
          const event = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
          });
          likeButton.dispatchEvent(event);
          await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.DOM_DEBOUNCE_MS));
          return true;
        } catch (e) {
          console.warn("[TweetReplyAI] MouseEvent simulation failed:", e);
          return false;
        }
      }
    }
    setupAutoLikeOnReply() {
      if (this.autoLikeClickHandler) return;
      if (!this.autoLikedTweetIds) this.autoLikedTweetIds = /* @__PURE__ */ new Set();
      this.autoLikeClickHandler = async (e) => {
        try {
          const target = e.target;
          if (!target) return;
          const composerContainer = target.closest('[data-testid="tweetComposer"]');
          const submitButton = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
          if (composerContainer && submitButton && composerContainer.contains(submitButton) && this.isReplyComposer(composerContainer)) {
            const pending = this.pendingReplyTarget;
            const maxAgeMs = 10 * 60 * 1e3;
            if (pending && pending.username && pending.username !== "unknown" && Date.now() - pending.setAt < maxAgeMs) {
              this.trackReply(pending.username).catch((err) => {
                console.warn("[TweetReplyAI] Reply tracking failed:", err);
              });
              setTimeout(() => this.updateReplyCountsOnTweets(), 600);
            }
            this.pendingReplyTarget = null;
            return;
          }
          const dialog = target.closest('[role="dialog"]');
          const sendBtnInDialog = target.closest('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
          if (dialog && sendBtnInDialog && dialog.contains(sendBtnInDialog)) {
            let usernameToTrack = null;
            const pending = this.pendingReplyTarget;
            const maxAgeMs = 10 * 60 * 1e3;
            if (pending && pending.username && pending.username !== "unknown" && Date.now() - pending.setAt < maxAgeMs) {
              usernameToTrack = pending.username;
            }
            if (!usernameToTrack) {
              const replyTargetArticle = dialog.querySelector('article[data-testid="tweet"]');
              if (replyTargetArticle) {
                usernameToTrack = this.extractUsernameFromTweetSync(replyTargetArticle);
              }
            }
            if (usernameToTrack && usernameToTrack !== "unknown") {
              this.trackReply(usernameToTrack).catch((err) => {
                console.warn("[TweetReplyAI] Reply tracking failed:", err);
              });
              setTimeout(() => this.updateReplyCountsOnTweets(), 600);
            }
            this.pendingReplyTarget = null;
            return;
          }
          const isReplyButton = target.matches('[data-testid="reply"]') || target.closest('[data-testid="reply"]') || target.matches('button[aria-label*="Reply" i]') || target.closest('button[aria-label*="Reply" i]') || target.matches('[role="button"][aria-label*="Reply" i]') || target.closest('[role="button"][aria-label*="Reply" i]');
          if (!isReplyButton) return;
          const replyButton = target.closest('[data-testid="reply"]') || target.closest('button[aria-label*="Reply" i]') || target.closest('[role="button"][aria-label*="Reply" i]') || target;
          const tweetArticle = this.findTweetArticle(replyButton);
          if (!tweetArticle) {
            return;
          }
          this.currentReplyTargetArticle = tweetArticle;
          if (this._replyTargetClearTimer) clearTimeout(this._replyTargetClearTimer);
          this._replyTargetClearTimer = setTimeout(() => {
            this.currentReplyTargetArticle = null;
            this._replyTargetClearTimer = null;
          }, 2500);
          const tweetId = this.getTweetIdFromArticle(tweetArticle);
          const username = this.extractUsernameFromTweetSync(tweetArticle);
          if (username && username !== "unknown") {
            this.pendingReplyTarget = { username, tweetId: tweetId || null, setAt: Date.now() };
          }
          if (this.autoLikeEnabled) {
            setTimeout(() => {
              const tweetId2 = this.getTweetIdFromArticle(tweetArticle);
              if (tweetId2 !== null && this.autoLikedTweetIds.has(tweetId2)) {
                return;
              }
              let liveArticle = tweetArticle;
              if (!tweetArticle.isConnected) {
                liveArticle = null;
                if (tweetId2) {
                  const articles = document.querySelectorAll('article[data-testid="tweet"]');
                  for (const a of articles) {
                    if (this.getTweetIdFromArticle(a) === tweetId2) {
                      liveArticle = a;
                      break;
                    }
                  }
                }
                if (!liveArticle) {
                  liveArticle = document.querySelector('[role="dialog"] article[data-testid="tweet"]');
                }
                if (!liveArticle) return;
              }
              const likeButton = this.findLikeButton(liveArticle);
              if (likeButton) {
                this.performAutoLike(likeButton).then(() => {
                  if (tweetId2 !== null) this.autoLikedTweetIds.add(tweetId2);
                }).catch((err) => {
                  console.warn("[TweetReplyAI] Auto-like execution failed:", err);
                });
              }
            }, 150);
          }
        } catch (error2) {
          console.error("[TweetReplyAI] Auto-like handler error:", error2);
        }
      };
      document.addEventListener("click", this.autoLikeClickHandler, true);
    }
    async initialize() {
      this.authManager.setApiClient(this.apiClient);
      await this.loadRelationshipHintsSetting();
      this.isAuthenticated = await this.authManager.isAuthenticated(true);
      if (this.isAuthenticated) {
        await this.loadUsageData();
      }
      this.startObserving();
      this.setupFollowStatusFromNetwork();
      this.autoLikeEnabled = await this.isAutoLikeEnabled();
      this.setupAutoLikeOnReply();
      this.setupReplyCountDisplay();
      if (!this.runtimeMessageHandler) {
        this.runtimeMessageHandler = (message, sender, sendResponse) => {
          if (message.action === "suggestReply") {
            this.handleSuggestReplyFromPopup();
          } else if (message.action === "shortcutCommand") {
            this.handleShortcutCommand(message.command);
          } else if (message.action === "authUpdated") {
            this.refreshAuthState();
          }
        };
        chrome.runtime.onMessage.addListener(this.runtimeMessageHandler);
      }
      if (!this.storageChangeHandler) {
        this.storageChangeHandler = (changes, areaName) => {
          if (areaName === "sync") {
            if (changes[STORAGE.RELATIONSHIP_HINTS_ENABLED]) {
              const nv = changes[STORAGE.RELATIONSHIP_HINTS_ENABLED].newValue;
              this.relationshipHintsEnabled = nv !== false;
              if (!this.relationshipHintsEnabled) {
                this.removeRelationshipBadgesFromDom();
              } else {
                this.scheduleFollowBadgeRefresh();
              }
            }
            if (changes[STORAGE.FOLLOW_BADGE_ICON_STYLE]) {
              this.followBadgeIconStyle = this.normalizeFollowBadgeIconStyle(
                changes[STORAGE.FOLLOW_BADGE_ICON_STYLE].newValue
              );
              this.scheduleFollowBadgeRefresh();
            }
          }
          if (areaName === "local") {
            if (changes.token) {
              this.refreshAuthState();
            }
            if (changes.replyHistory || changes.replyTrackingSettings) {
              this.updateReplyCountsOnTweets();
            }
            if ("tweetreply_auto_like" in changes) {
              this.autoLikeEnabled = changes.tweetreply_auto_like.newValue !== false;
            }
          }
        };
        chrome.storage.onChanged.addListener(this.storageChangeHandler);
      }
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
      }
      this.usageDataInterval = setInterval(() => {
        if (this.isAuthenticated) {
          this.loadUsageData();
        }
      }, POLLING.USAGE_REFRESH_MS);
    }
    async refreshAuthState() {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = await this.authManager.isAuthenticated(true);
      if (this.isAuthenticated && !wasAuthenticated) {
        await this.loadUsageData();
      }
      this.updateAllButtonStates();
    }
    async loadUsageData() {
      try {
        this.usageData = await this.apiClient.getUsage();
        this.maybeInjectModelSelectsIntoLiveContainers();
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to load usage data:", error2);
        this.usageData = null;
        throw error2;
      }
    }
    maybeInjectModelSelectsIntoLiveContainers() {
      if (!this.usageData?.showModelSelect) return;
      document.querySelectorAll(".tweetreply-button-container").forEach((container) => {
        if (container.querySelector(".tweetreply-model-select")) return;
        const modelSelect = this.createModelSelect();
        const firstChild = container.firstChild;
        if (firstChild) {
          container.insertBefore(modelSelect, firstChild);
        } else {
          container.appendChild(modelSelect);
        }
      });
    }
    normalizeFollowBadgeIconStyle(value) {
      if (typeof value === "string" && FOLLOW_BADGE_ICON_STYLE_VALUES.includes(value)) {
        return value;
      }
      return FOLLOW_BADGE_ICON_STYLE_DEFAULT;
    }
    /**
     * @returns {{ iconChar: string | null, label: string, ariaLabel: string }}
     */
    getFollowBadgeParts(followedBy) {
      const followsLabel = "Follows you";
      const notLabel = "Doesn't follow you";
      const style = this.followBadgeIconStyle;
      if (style === FOLLOW_BADGE_ICON_STYLE.EMOJI) {
        const iconChar = followedBy ? "\u2713" : "\u2717";
        const label = followedBy ? followsLabel : notLabel;
        return {
          iconChar,
          label,
          ariaLabel: `${iconChar} ${label}`
        };
      }
      if (style === FOLLOW_BADGE_ICON_STYLE.ICON_ONLY) {
        const iconChar = followedBy ? "\u2713" : "\u2717";
        return {
          iconChar,
          label: "",
          ariaLabel: followedBy ? followsLabel : notLabel
        };
      }
      return {
        iconChar: null,
        label: followedBy ? followsLabel : notLabel,
        ariaLabel: followedBy ? followsLabel : notLabel
      };
    }
    populateFollowBadgeElement(span, followedBy) {
      const parts = this.getFollowBadgeParts(followedBy);
      span.classList.toggle(
        "tweetreply-follow-badge--icon-only",
        this.followBadgeIconStyle === FOLLOW_BADGE_ICON_STYLE.ICON_ONLY
      );
      span.setAttribute("title", parts.ariaLabel);
      span.setAttribute("aria-label", parts.ariaLabel);
      if (parts.iconChar) {
        const iconSpan = document.createElement("span");
        iconSpan.className = "tweetreply-follow-badge__icon";
        iconSpan.setAttribute("aria-hidden", "true");
        iconSpan.textContent = parts.iconChar;
        span.appendChild(iconSpan);
      }
      if (parts.label) {
        span.appendChild(document.createTextNode(parts.label));
      }
    }
    findHandleAnchorElement(userNameElement) {
      if (!userNameElement) return null;
      const links = userNameElement.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const text = (link.textContent || "").trim();
        if (text.startsWith("@")) return link;
      }
      return null;
    }
    async loadRelationshipHintsSetting() {
      try {
        const r = await chrome.storage.sync.get([
          STORAGE.RELATIONSHIP_HINTS_ENABLED,
          STORAGE.FOLLOW_BADGE_ICON_STYLE
        ]);
        this.relationshipHintsEnabled = r[STORAGE.RELATIONSHIP_HINTS_ENABLED] !== false;
        this.followBadgeIconStyle = this.normalizeFollowBadgeIconStyle(r[STORAGE.FOLLOW_BADGE_ICON_STYLE]);
      } catch {
        this.relationshipHintsEnabled = true;
        this.followBadgeIconStyle = FOLLOW_BADGE_ICON_STYLE_DEFAULT;
      }
    }
    // ============================================================================
    // FOLLOW STATUS — main-world interceptor → postMessage → cache → badge
    // ============================================================================
    setupFollowStatusFromNetwork() {
      if (this.followStatusMessageHandler) return;
      this.followStatusMessageHandler = (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.type !== "TWEETREPLY_FOLLOW_STATUS") return;
        if (!d.hasRelationshipData) return;
        this.followStatusByUser.set(String(d.username).toLowerCase(), {
          followedBy: !!d.followedBy,
          following: !!d.following,
          hasRelationshipData: true
        });
        this.scheduleFollowBadgeRefresh();
      };
      window.addEventListener("message", this.followStatusMessageHandler);
      window.postMessage({ type: "TWEETREPLY_REQUEST_BUFFER_REPLAY" }, "*");
    }
    removeRelationshipBadgesFromDom() {
      document.querySelectorAll('[data-tweetreply-follow-badge="1"]').forEach((n) => n.remove());
      document.querySelectorAll(".tweetreply-firstline-badge-cluster").forEach((cluster) => {
        if (cluster.querySelector('[data-tweetreply-follow-badge="1"]')) return;
        const parent = cluster.parentNode;
        if (!parent) return;
        while (cluster.firstChild) parent.insertBefore(cluster.firstChild, cluster);
        cluster.remove();
      });
    }
    scheduleFollowBadgeRefresh() {
      if (this.followBadgeRefreshTimer) clearTimeout(this.followBadgeRefreshTimer);
      this.followBadgeRefreshTimer = setTimeout(() => {
        this.followBadgeRefreshTimer = null;
        this.updateFollowBadgesOnPage();
      }, 150);
    }
    updateFollowBadgesOnPage() {
      if (!this.relationshipHintsEnabled) {
        this.removeRelationshipBadgesFromDom();
        return;
      }
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      articles.forEach((article) => {
        const username = this.extractUsernameFromTweetSync(article);
        const existing = article.querySelector(".tweetreply-follow-badge");
        if (existing) existing.remove();
        if (!username || username === "unknown") return;
        const key = username.toLowerCase();
        const entry = this.followStatusByUser.get(key);
        if (!entry || !entry.hasRelationshipData) return;
        const userNameElement = article.querySelector('[data-testid="User-Name"]');
        if (!userNameElement || !userNameElement.isConnected) return;
        const span = document.createElement("span");
        span.className = entry.followedBy ? "tweetreply-follow-badge tweetreply-follow-badge--follows" : "tweetreply-follow-badge tweetreply-follow-badge--not";
        span.setAttribute("data-tweetreply-follow-badge", "1");
        this.populateFollowBadgeElement(span, entry.followedBy);
        const timeEl = userNameElement.querySelector("time");
        if (timeEl && timeEl.parentNode) {
          timeEl.after(document.createTextNode(" "), span);
          return;
        }
        const handleEl = this.findHandleAnchorElement(userNameElement);
        if (handleEl && handleEl.parentNode) {
          handleEl.after(document.createTextNode(" "), span);
          return;
        }
        userNameElement.appendChild(document.createTextNode(" "));
        userNameElement.appendChild(span);
      });
    }
    startObserving() {
      if (this.mainObserver) return;
      this.mainObserverDebounceTimer = null;
      const addedNodes = /* @__PURE__ */ new Set();
      this.mainObserver = new MutationObserver((mutations) => {
        clearTimeout(this.mainObserverDebounceTimer);
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              addedNodes.add(node);
            }
          });
        });
        this.mainObserverDebounceTimer = setTimeout(() => {
          addedNodes.forEach((node) => {
            this.checkForReplyComposers(node);
            this.injectReuseButtons(node);
          });
          addedNodes.clear();
          this.scheduleFollowBadgeRefresh();
          if (this.countDisplayInitialized) {
            if (this.countUpdateTimeout) {
              clearTimeout(this.countUpdateTimeout);
            }
            this.countUpdateTimeout = setTimeout(async () => {
              try {
                await this.updateReplyCountsOnTweets();
              } catch (error2) {
                console.error("[TweetReplyAI] Error updating reply counts:", error2);
              }
            }, TIMEOUTS.AUTH_SYNC_DELAY_MS);
          }
        }, TIMEOUTS.DOM_DEBOUNCE_MS);
      });
      this.mainObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.checkForReplyComposers(document.body);
      this.injectReuseButtons(document.body);
    }
    checkForReplyComposers(container) {
      const specificSelectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea_1"]',
        '[data-testid="tweetTextarea_2"]'
      ];
      const genericSelectors = [
        '[aria-label*="reply" i][contenteditable="true"]',
        '[aria-label*="post" i][contenteditable="true"]',
        '[aria-label*="tweet" i][contenteditable="true"]',
        ".public-DraftEditor-content",
        ".DraftEditor-editorContainer",
        '[data-testid="toolBar"] ~ div [contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-testid]'
      ];
      let found = false;
      for (const selector of specificSelectors) {
        try {
          const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
          if (composers.length > 0) {
            composers.forEach((composer) => this.injectSuggestButton(composer));
            found = true;
          }
        } catch (error2) {
          console.error("Error checking selector:", selector, error2);
        }
      }
      if (!found) {
        for (const selector of genericSelectors) {
          try {
            const composers = container.querySelectorAll ? container.querySelectorAll(selector) : [];
            composers.forEach((composer) => this.injectSuggestButton(composer));
          } catch (error2) {
            console.error("Error checking selector:", selector, error2);
          }
        }
      }
    }
    injectSuggestButton(composer) {
      if (!composer || this.injectedButtons.has(composer)) return;
      let composerContainer = composer.closest('[data-testid="tweetComposer"]') || composer.closest('[role="dialog"]') || composer.closest("div[data-testid]");
      if (!composerContainer) return;
      const topTweetComposer = composerContainer.closest('[data-testid="tweetComposer"]');
      if (topTweetComposer) composerContainer = topTweetComposer;
      const inDialog = composerContainer.closest('[role="dialog"]');
      if (inDialog) {
        if (inDialog.querySelector(".tweetreply-button-container")) {
          this.injectedButtons.add(composer);
          return;
        }
      } else {
        let ancestor = composerContainer.parentElement;
        while (ancestor) {
          if (ancestor.querySelector && ancestor.querySelector(".tweetreply-button-container")) {
            this.injectedButtons.add(composer);
            return;
          }
          ancestor = ancestor.parentElement;
        }
      }
      let containerId = composerContainer.dataset.tweetreplyContainerId;
      if (!containerId) {
        containerId = `tweetreply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        composerContainer.dataset.tweetreplyContainerId = containerId;
      }
      if (composerContainer.querySelector(".tweetreply-button-container") || this.injectedContainers.has(containerId)) {
        this.injectedButtons.add(composer);
        return;
      }
      this.injectedContainers.add(containerId);
      const ctx = this.getComposerContext(composerContainer);
      if (ctx.type === "post") {
        return;
      }
      if (this.isTweetDetailPage() && !composerContainer.closest('[role="dialog"]')) {
        this.injectedButtons.add(composer);
        return;
      }
      let toolbar = composerContainer.querySelector('[data-testid="toolBar"]') || composerContainer.querySelector(".toolbar") || composerContainer.querySelector('[role="toolbar"]');
      if (!toolbar) {
        const buttonContainers = composerContainer.querySelectorAll("div");
        for (const container of buttonContainers) {
          if (container.querySelectorAll("button").length >= 2) {
            toolbar = container;
            break;
          }
        }
      }
      if (!toolbar) {
        toolbar = this.createToolbar(composer);
      }
      if (toolbar && !toolbar.querySelector(".tweetreply-button-container")) {
        const controlsRow = this.createSuggestButton(composer, containerId);
        controlsRow.hidden = ctx.type === "post";
        if (toolbar.parentNode) {
          toolbar.parentNode.insertBefore(controlsRow, toolbar);
        } else {
          this.insertButtonInToolbar(toolbar, controlsRow);
        }
        this.injectedButtons.add(composer);
      }
    }
    createToolbar(composer) {
      const toolbar = document.createElement("div");
      toolbar.className = "tweetreply-toolbar";
      toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 0;
    `;
      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(toolbar, composer.nextSibling);
      }
      return toolbar;
    }
    // Determine whether an element belongs to a reply composer (not main tweet box)
    isReplyComposer(containerEl) {
      if (!containerEl) return false;
      const hasReplyPlaceholder = !!Array.from(containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]')).find((el) => /post your reply/i.test(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || ""));
      const toolbar = containerEl.querySelector('[data-testid="toolBar"], [role="toolbar"]') || containerEl;
      const replyBtn = this.findReplyButton(toolbar);
      return !!(hasReplyPlaceholder || replyBtn);
    }
    // Determine if this is the main tweet composer ("What's happening?")
    isMainComposer(containerEl) {
      const textareas = containerEl.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
      for (const el of textareas) {
        const hint = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").toLowerCase();
        if (hint.includes("what's happening") || hint.includes("what\u2019s happening")) return true;
        if (/^post\s*text$/i.test(hint) && !containerEl.closest('[role="dialog"], article')) return true;
      }
      const hasPost = !!(containerEl.querySelector('[data-testid="tweetButton"]') || Array.from(containerEl.querySelectorAll('div[role="button"], button')).some((btn) => /^(post|tweet)$/i.test((btn.getAttribute("aria-label") || btn.textContent || "").trim())));
      const hasReply = !!this.findReplyButton(containerEl);
      if (!hasReply && hasPost) return true;
      const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
      const globalInlineText = globalInlineBtn?.textContent?.trim() || "";
      if (/^post$/i.test(globalInlineText) && !containerEl.closest('[role="dialog"], article')) return true;
      return hasPost && !hasReply;
    }
    // Classify composer container context
    getComposerContext(containerEl) {
      if (!containerEl) return { type: "unknown" };
      if (this.isMainComposer(containerEl)) return { type: "post" };
      if (this.isReplyComposer(containerEl)) {
        const article = containerEl.closest("article");
        const hasDetailsHeader = !!document.querySelector("article time");
        return { type: article ? "inline" : "detail" };
      }
      return { type: "unknown" };
    }
    isTweetDetailPage() {
      const currentPath = window.location.pathname;
      const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
      return /\/status\/\d+/.test(effectivePath);
    }
    /**
     * Get the status ID from the tweet details page URL (source of truth for which tweet this page is about).
     * Uses same path logic as isTweetDetailPage (lastNonComposePath when on /compose/).
     * @returns {string|null} Status ID or null if not a detail page
     */
    getStatusIdFromDetailPageUrl() {
      const currentPath = window.location.pathname;
      const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
      const match = effectivePath.match(/\/status\/(\d+)/);
      return match ? match[1] : null;
    }
    /**
     * Extract original tweet info from page meta / URL — never virtualized, survives any scrolling.
     * Author handle comes from the URL path; text from og:description or document.title.
     * @returns {{ statusId: string, text: string|null, author: string }|null}
     */
    getOriginalTweetFromPageMeta() {
      const path = /\/compose\//.test(window.location.pathname) ? this.lastNonComposePath : window.location.pathname;
      const pathMatch = path.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
      if (!pathMatch) return null;
      const author = pathMatch[1];
      const statusId = pathMatch[2];
      const ogUrl = document.querySelector('meta[property="og:url"]')?.content || "";
      if (!ogUrl || !ogUrl.includes("/status/" + statusId)) return null;
      let text = null;
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content?.trim();
      if (ogDesc && ogDesc.length > 10) text = ogDesc;
      if (!text) {
        const titleMatch = document.title.match(/:\s+"(.+?)"\s*\/\s*X\s*$/i);
        if (titleMatch) text = titleMatch[1].trim();
      }
      return { statusId, text, author };
    }
    /**
     * Get a tweet article's own status ID via the timestamp link.
     * The <time> element is always wrapped in the tweet's own permalink, never a "Replying to" link.
     * @param {Element} article
     * @returns {string|null}
     */
    getOwnStatusIdFromArticle(article) {
      if (!article) return null;
      const timeLink = article.querySelector("time")?.closest('a[href*="/status/"]');
      if (timeLink) {
        const href = timeLink.getAttribute("href") || timeLink.href || "";
        const m = href.match(/\/status\/(\d+)/);
        if (m) return m[1];
      }
      return null;
    }
    /**
     * Proactively populate _originalTweetCache for the current detail page.
     * Called every URL_TRACKING_MS so the cache is ready before the user scrolls.
     */
    tryEagerCacheOriginalTweet() {
      try {
        const statusId = this.getStatusIdFromDetailPageUrl();
        if (!statusId) return;
        if (this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) return;
        if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
          this._originalTweetCache = null;
        }
        const article = this.findOriginalTweetArticleByStatusId(statusId);
        if (article) {
          const data = this.extractTextAndAuthorFromArticle(article);
          if (data) {
            this._originalTweetCache = { statusId, text: data.text, author: data.author, fromDom: true };
          }
        }
      } catch (e) {
      }
    }
    /**
     * Extract text and author from a single tweet article (same logic as extractTweetsFromContainer).
     * @param {Element} article - article[data-testid="tweet"]
     * @returns {{ text: string, author: string }|null}
     */
    extractTextAndAuthorFromArticle(article) {
      if (!article) return null;
      const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
      if (!tweetTextEl) return null;
      const text = extractTweetPlainText(tweetTextEl);
      if (!text || text.length < 10) return null;
      let author = "unknown";
      const userNameEl = article.querySelector('[data-testid="User-Name"]');
      if (userNameEl) {
        const fullText = userNameEl.textContent?.trim() || "";
        const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
        if (handleMatch) author = handleMatch[1];
      }
      if (author === "unknown" && userNameEl) {
        const profileLink = userNameEl.querySelector("a[href]");
        if (profileLink) {
          const href = profileLink.getAttribute("href") || "";
          const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
          if (hrefMatch) author = hrefMatch[1];
        }
      }
      if (author === "unknown") {
        const links = article.querySelectorAll("a[href]");
        const reservedPaths = /* @__PURE__ */ new Set(["status", "search", "intent", "i", "home", "hashtag", "compose", "settings", "explore", "notifications", "messages"]);
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
          if (hrefMatch && !reservedPaths.has(hrefMatch[1].toLowerCase())) {
            author = hrefMatch[1];
            break;
          }
        }
      }
      return { text, author };
    }
    /**
     * Extract the canonical tweet permalink (/{user}/status/{id}) from an
     * article. Returns an absolute URL or undefined. Used by the Reuse feature
     * because extractTextAndAuthorFromArticle intentionally returns only text+author.
     */
    extractTweetUrlFromArticle(article) {
      if (!article) return void 0;
      try {
        const timeEl = article.querySelector('a[role="link"] time');
        const anchor = timeEl && timeEl.closest('a[href*="/status/"]') || article.querySelector('a[href*="/status/"]');
        if (!anchor) return void 0;
        const href = anchor.getAttribute("href") || "";
        if (!href) return void 0;
        return new URL(href, window.location.origin).toString();
      } catch {
        return void 0;
      }
    }
    /**
     * Inject a Reuse button onto every X tweet article in the given container.
     * Delegates to the pure helper `injectReuseButtonsImpl` with DI.
     */
    injectReuseButtons(container) {
      try {
        injectReuseButtonsImpl(container, {
          injected: this.injectedReuseButtons,
          onClick: (payload) => this.openReuseModal(payload),
          extractText: (article) => this.extractTextAndAuthorFromArticle(article),
          extractTweetUrl: (article) => this.extractTweetUrlFromArticle(article),
          minSourceLen: REUSE.MIN_SOURCE_LEN,
          buttonClass: REUSE.BUTTON_CLASS,
          buttonTitle: REUSE.BUTTON_TITLE
        });
      } catch (error2) {
        console.warn("[TweetReplyAI] injectReuseButtons failed:", error2);
      }
    }
    /**
     * Open (or refocus) the Reuse modal for the given source tweet. Only one
     * modal is mounted at a time; a second invocation closes the previous one.
     */
    openReuseModal(payload) {
      try {
        if (this._reuseModal) {
          try {
            this._reuseModal.close();
          } catch {
          }
          this._reuseModal = null;
        }
        this._reuseModal = createReuseModal(payload, {
          apiClient: this.apiClient,
          postToCompose: (text) => this.postReframedToCompose(text),
          onUsageUpdated: () => {
            try {
              chrome.runtime.sendMessage({ action: "usageUpdated" });
            } catch {
            }
          },
          emitTelemetry,
          getUserFacingError,
          constants: REUSE,
          loginUrl: API.LOGIN_URL,
          usagePicker: {
            showModelSelect: Boolean(this.usageData?.showModelSelect),
            selectableModels: this.usageData?.selectableModels ?? null
          }
        });
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to open Reuse modal:", error2);
      }
    }
    /**
     * Navigate to X's native compose dialog and insert the reframed text. Never
     * auto-submits; the user reviews and posts manually. Pure logic lives in
     * `helpers/post-to-compose.js` so it can be unit-tested without the full
     * injector.
     */
    async postReframedToCompose(text) {
      return postReframedToComposeImpl(text, {
        insertText: (ta, tb, t) => this.insertTextTwitterMethod(ta, tb, t),
        emitTelemetry,
        config: {
          composePath: REUSE.COMPOSE_URL_PATH || "/compose/post",
          pollMs: REUSE.COMPOSE_POLL_MS,
          timeoutMs: REUSE.COMPOSE_POLL_TIMEOUT_MS
        }
      });
    }
    /**
     * Find the article that owns the given status ID (the tweet's own permalink, not "Replying to" or quoted).
     * @param {string} statusId - Status ID from URL
     * @returns {Element|null} The article element or null
     */
    findOriginalTweetArticleByStatusId(statusId) {
      if (!statusId) return null;
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      const statusPath = "/status/" + statusId;
      for (const article of articles) {
        const links = article.querySelectorAll('a[href*="' + statusPath + '"]');
        for (const link of links) {
          const href = (link.getAttribute("href") || link.href || "").split("?")[0];
          if (!href.includes(statusPath)) continue;
          if (href.includes("/analytics")) continue;
          let node = link;
          let insideReplyingTo = false;
          while (node && node !== article) {
            const text = (node.textContent || "").trim();
            if (/^replying to @/i.test(text) || node !== link && /replying to/i.test(text)) {
              insideReplyingTo = true;
              break;
            }
            node = node.parentElement;
          }
          if (!insideReplyingTo) {
            const ownId = this.getOwnStatusIdFromArticle(article);
            if (ownId === statusId) return article;
          }
        }
      }
      return null;
    }
    /**
     * When the reply composer modal is open (/compose/post), the tweet shown above the composer
     * is the one we're replying to. Return that article so tweetId and current tweet text match the UI.
     * @returns {Element|null}
     */
    getReplyTargetArticleFromComposerDialog() {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const dialog of dialogs) {
        const hasComposer = dialog.querySelector('[data-testid^="tweetTextarea_"]');
        const tweetArticle = dialog.querySelector('article[data-testid="tweet"]');
        if (hasComposer && tweetArticle) return tweetArticle;
      }
      return null;
    }
    // Find the native Reply button inside toolbar
    findReplyButton(toolbarEl) {
      if (!toolbarEl) return null;
      const byTestId = toolbarEl.querySelector('[data-testid="tweetButtonInline"]');
      if (byTestId) return byTestId;
      const candidates = Array.from(toolbarEl.querySelectorAll('div[role="button"], button'));
      let found = candidates.find((btn) => /reply/i.test(btn.getAttribute("aria-label") || ""));
      if (found) return found;
      found = candidates.find((btn) => /reply/i.test((btn.textContent || "").trim()));
      if (found) return found;
      const globalInlineBtn = document.querySelector('[data-testid="tweetButtonInline"]');
      if (globalInlineBtn && /reply/i.test(globalInlineBtn.textContent || "")) return globalInlineBtn;
      return null;
    }
    // Place our Suggest button immediately to the left of the native Reply button
    placeSuggestButtonLeftOfReply(toolbarEl, controlsRow) {
      const replyBtn = this.findReplyButton(toolbarEl);
      if (!replyBtn) return false;
      const suggestBtn = controlsRow.querySelector(".tweetreply-suggest-btn");
      if (!suggestBtn) return;
      if (toolbarEl.contains(suggestBtn)) return true;
      suggestBtn.style.marginRight = "8px";
      const parent = replyBtn.parentElement || toolbarEl;
      if (parent) {
        parent.insertBefore(suggestBtn, replyBtn);
      }
      return true;
    }
    // Observe toolbar for changes and retry placement until success
    observePlacement(toolbarEl, controlsRow) {
      let attempts = 0;
      const tryPlace = () => {
        if (this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
          observer.disconnect();
        } else if (++attempts >= 8) {
          observer.disconnect();
        }
      };
      const observer = new MutationObserver(() => {
        tryPlace();
      });
      observer.observe(toolbarEl, { childList: true, subtree: true });
      setTimeout(tryPlace, TIMEOUTS.PLACEMENT_OBSERVER_MS);
    }
    // Ensure Suggest stays left of Reply across focus/typing/renders
    ensureSuggestLeftOfReply(toolbarEl, controlsRow, containerEl, opts = {}) {
      if (!this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow)) {
        this.observePlacement(toolbarEl, controlsRow);
      }
      if (!opts.skipReplacementListeners) {
        let last = 0;
        const throttleMs = TIMEOUTS.BUTTON_THROTTLE_MS;
        const maybePlace = () => {
          const now = Date.now();
          if (now - last < throttleMs) return;
          last = now;
          this.placeSuggestButtonLeftOfReply(toolbarEl, controlsRow);
        };
        const events = ["focusin", "input", "keyup"];
        events.forEach((ev) => {
          containerEl.addEventListener(ev, maybePlace, { passive: true });
        });
      }
    }
    createSuggestButton(composer, containerId) {
      const container = document.createElement("div");
      container.className = "tweetreply-button-container";
      container.dataset.containerId = containerId;
      container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0 6px 0;
      position: relative;
      z-index: 1;
    `;
      let modelSelect = null;
      if (this.usageData?.showModelSelect) {
        modelSelect = this.createModelSelect();
        container.appendChild(modelSelect);
      }
      const replyModeSelect = this.createReplyModeSelect();
      container.appendChild(replyModeSelect);
      const promptSelect = this.createPromptSelect();
      container.appendChild(promptSelect);
      const suggestButton = document.createElement("button");
      suggestButton.className = "tweetreply-suggest-btn";
      suggestButton.dataset.authPending = "true";
      suggestButton.disabled = true;
      suggestButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span>Checking...</span>
    `;
      suggestButton.title = "Checking authentication...";
      this.updateButtonStateAsync(suggestButton);
      suggestButton.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (suggestButton.dataset.authPending === "true") {
          await this.updateButtonStateAsync(suggestButton);
        }
        if (!this.isAuthenticated) {
          await this.openLoginPage();
          return;
        }
        if (suggestButton.dataset.loadError === "true") {
          console.log("[TweetReplyAI] Retrying button initialization...");
          delete suggestButton.dataset.loadError;
          suggestButton.dataset.authPending = "true";
          this.updateButtonState(suggestButton);
          await this.updateButtonStateAsync(suggestButton);
          return;
        }
        const actualComposer = composer.querySelector('[contenteditable="true"]') || composer.querySelector(".public-DraftEditor-content") || composer;
        console.log("[TweetReplyAI] Button click - Composer container:", composer.getAttribute("data-testid"));
        console.log("[TweetReplyAI] Button click - Actual composer:", actualComposer.contentEditable, actualComposer.className);
        this.handleSuggestReply(actualComposer, suggestButton, {
          modelKey: modelSelect ? modelSelect.value : "auto",
          replyMode: replyModeSelect.value,
          promptVariation: promptSelect.value
        });
      });
      const improveButton = this.createImproveButton(composer);
      container.appendChild(suggestButton);
      container.appendChild(improveButton);
      if (!this.isTweetDetailPage()) {
        container.appendChild(this.createCtaButton(composer));
      }
      return container;
    }
    async updateButtonStateAsync(button) {
      try {
        console.log("[TweetReplyAI] Initializing button state...");
        if (!this.isAuthenticated) {
          this.isAuthenticated = await this.authManager.isAuthenticated(true);
          console.log("[TweetReplyAI] Auth status:", this.isAuthenticated);
        }
        if (this.isAuthenticated && !this.usageData) {
          console.log("[TweetReplyAI] Loading usage data...");
          try {
            await Promise.race([
              this.loadUsageData(),
              new Promise(
                (_, reject) => setTimeout(() => reject(new Error("Timeout after 10 seconds")), TIMEOUTS.USAGE_LOAD_MS)
              )
            ]);
            console.log("[TweetReplyAI] Usage data loaded:", this.usageData);
          } catch (error2) {
            console.warn("[TweetReplyAI] Failed to load usage data, using fallback:", error2);
            this.usageData = {
              used: 0,
              limit: 999,
              resetAt: new Date(Date.now() + AUTH.ONE_DAY_MS).toISOString()
            };
          }
        }
        delete button.dataset.authPending;
        delete button.dataset.loadError;
        this.updateButtonState(button);
      } catch (error2) {
        console.error("[TweetReplyAI] Critical error initializing button:", error2);
        delete button.dataset.authPending;
        button.dataset.loadError = "true";
        this.updateButtonState(button);
      }
    }
    createModelSelect() {
      return createModelSelectElement({
        selectableModels: this.usageData?.selectableModels ?? null,
        className: "tweetreply-model-select",
        title: "Choose AI model"
      });
    }
    createPromptSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-prompt-select";
      select.title = "Choose reply style";
      let savedPrompt = null;
      try {
        chrome.storage?.local?.get(["tweetreply_prompt"], (data) => {
          if (data && typeof data.tweetreply_prompt === "string") {
            savedPrompt = data.tweetreply_prompt;
          }
        });
      } catch (_) {
      }
      this.loadPrompts().then((prompts) => {
        if (prompts && Array.isArray(prompts)) {
          prompts.forEach((prompt) => {
            if (prompt.key === "improve" || prompt.key === "guardrail_violation") return;
            const option = document.createElement("option");
            option.value = prompt.key;
            const label = prompt.key === "conversational" ? "Chat" : prompt.name;
            option.textContent = label;
            select.appendChild(option);
          });
        }
        const options = Array.from(select.querySelectorAll("option"));
        if (savedPrompt && options.some((o) => o.value === savedPrompt)) {
          select.value = savedPrompt;
        } else {
          const preferred = options.find((o) => /direct/i.test(o.textContent || "")) || null;
          if (preferred) {
            select.insertBefore(preferred, select.children[0] || null);
            select.value = preferred.value;
          }
        }
      }).catch((error2) => {
        console.error("Failed to load prompts:", error2);
      });
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({ tweetreply_prompt: select.value });
        } catch (_) {
        }
      });
      return select;
    }
    createReplyModeSelect() {
      const select = document.createElement("select");
      select.className = "tweetreply-reply-mode-select";
      select.title = "Choose reply generation mode";
      const modes = [
        { value: "single-sentence", label: "\u26A1 Concise", tooltip: "Fast one-sentence reply" },
        { value: "enhanced", label: "\u{1F9E0} Enhanced", tooltip: "Context-aware with deep analysis" }
      ];
      modes.forEach((mode) => {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        option.title = mode.tooltip;
        select.appendChild(option);
      });
      select.value = "enhanced";
      try {
        chrome.storage?.local?.get(["tweetreply_reply_mode"], (data) => {
          if (data && typeof data.tweetreply_reply_mode === "string") {
            const savedMode = data.tweetreply_reply_mode;
            if (modes.some((m) => m.value === savedMode)) {
              select.value = savedMode;
              console.log("[TweetReplyAI] Restored reply mode from storage:", savedMode);
            } else {
              select.value = "enhanced";
              try {
                chrome.storage?.local?.set({ tweetreply_reply_mode: "enhanced" });
              } catch (_) {
              }
              console.log("[TweetReplyAI] Saved reply mode not valid, using default");
            }
          }
        });
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to restore reply mode from storage:", error2);
      }
      select.addEventListener("change", () => {
        try {
          chrome.storage?.local?.set({ tweetreply_reply_mode: select.value });
          console.log("[TweetReplyAI] Reply mode changed to:", select.value);
        } catch (_) {
        }
      });
      return select;
    }
    async loadModels() {
      try {
        return await this.apiClient.getModels();
      } catch (error2) {
        console.error("Failed to load models:", error2);
        return null;
      }
    }
    async loadPrompts() {
      try {
        return await this.apiClient.getPrompts();
      } catch (error2) {
        console.error("Failed to load prompts:", error2);
        return null;
      }
    }
    createImproveButton(composer) {
      const button = document.createElement("button");
      button.className = "tweetreply-improve-btn";
      button.dataset.authPending = "true";
      button.setAttribute("aria-label", "Improve current draft reply");
      button.disabled = true;
      button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
          <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
          <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
        </circle>
      </svg>
      <span>Checking...</span>
    `;
      button.title = "Checking authentication...";
      this.updateButtonStateAsync(button);
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (button.dataset.authPending === "true") {
          await this.updateButtonStateAsync(button);
        }
        if (!this.isAuthenticated) {
          await this.openLoginPage();
          return;
        }
        if (button.dataset.loadError === "true") {
          console.log("[TweetReplyAI] Retrying improve button initialization...");
          delete button.dataset.loadError;
          button.dataset.authPending = "true";
          this.updateButtonState(button);
          await this.updateButtonStateAsync(button);
          return;
        }
        const actualComposer = composer.querySelector('[contenteditable="true"]') || composer.querySelector(".public-DraftEditor-content") || composer;
        this.handleImproveReply(actualComposer, button);
      });
      return button;
    }
    createCtaButton(composer) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tweetreply-cta-btn";
      button.setAttribute("aria-label", "Append saved CTA to reply");
      button.title = "Append saved CTA to reply";
      button.textContent = "CTA";
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const actualComposer = composer.querySelector('[contenteditable="true"]') || composer.querySelector(".public-DraftEditor-content") || composer;
        try {
          const { defaultSnippet, legacyText } = await this.getSnippetLibraryState();
          const t = defaultSnippet?.text || legacyText;
          if (!t || !String(t).trim()) {
            this.showMessage(actualComposer, "Set your CTA in extension Settings", "info");
            return;
          }
          await this.appendCtaSnippetToComposer(actualComposer, String(t));
        } catch (err) {
          console.error("[TweetReplyAI] CTA append failed:", err);
          emitTelemetry({
            event_type: "storage_read_failed",
            surface: "content",
            error_code: err?.message || "cta_append_failed",
            context: { action: "cta_click" }
          });
          this.showMessage(actualComposer, "Could not add CTA", "error");
        }
      });
      return button;
    }
    updateButtonState(button) {
      if (!button || typeof button.closest !== "function" || typeof button.classList === "undefined") {
        return;
      }
      if (button.dataset.authPending === "true") {
        return;
      }
      if (button.dataset.loadError === "true") {
        button.disabled = false;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.8"/>
        </svg>
        <span>\u26A0\uFE0F Retry</span>
      `;
        button.title = "Failed to load. Click to retry.";
        button.style.opacity = "0.8";
        return;
      }
      if (!this.isAuthenticated) {
        button.disabled = false;
        button.dataset.requiresAuth = "true";
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z" opacity="0.6"/>
        </svg>
        <span>\u{1F512} Sign in to use</span>
      `;
        button.title = `Click to sign in to ${APP_DISPLAY_NAME}`;
        button.style.opacity = "0.85";
        return;
      }
      if (!this.usageData) {
        button.disabled = true;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
            <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416;0 31.416" repeatCount="indefinite"/>
            <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416;-31.416" repeatCount="indefinite"/>
          </circle>
        </svg>
        <span>\u23F3 Loading...</span>
      `;
        button.title = "Loading usage data...";
        button.style.opacity = "1";
        return;
      }
      if (this.usageData.used >= this.usageData.limit) {
        const container2 = button.closest(".tweetreply-button-container");
        const improveBtn2 = container2?.querySelector(".tweetreply-improve-btn");
        if (button.classList.contains("tweetreply-improve-btn")) {
          button.style.display = "none";
          return;
        }
        button.disabled = false;
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
        <span>Upgrade to unlock replies</span>
      `;
        button.title = `You've used all ${this.usageData.limit} credits: upgrade now to keep replying!`;
        button.style.opacity = "1";
        button.style.background = "#3b82f6";
        button.style.color = "#ffffff";
        button.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const domain = API.DEFAULT_DOMAIN;
          const protocol = domain.includes("localhost") ? "http" : "https";
          chrome.runtime.sendMessage({ action: "openLoginPage", url: `${protocol}://${domain}/pricing` });
        };
        if (improveBtn2) improveBtn2.style.display = "none";
        return;
      }
      const isImproveButton = button.classList.contains("tweetreply-improve-btn");
      button.disabled = false;
      delete button.dataset.requiresAuth;
      const container = button.closest(".tweetreply-button-container");
      const improveBtn = container?.querySelector(".tweetreply-improve-btn");
      if (improveBtn) improveBtn.style.removeProperty("display");
      if (!isImproveButton) {
        button.onclick = null;
        button.style.removeProperty("background");
        button.style.removeProperty("color");
      }
      if (isImproveButton) {
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>Improve reply</span>
      `;
        button.title = "Improve the current draft reply";
      } else {
        button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="margin-right: 4px;">
          <path d="M12 2L13.09 8.26L19 7.27L14.18 12.09L20 17.91L13.09 15.74L12 22L10.91 15.74L4 17.91L8.82 12.09L3 7.27L8.91 8.26L12 2Z"/>
        </svg>
        <span>Suggest reply</span>
      `;
        button.title = "Generate an AI reply suggestion";
      }
      button.style.opacity = "1";
    }
    async openLoginPage() {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "getApiDomain" }, (response2) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response2);
          });
        });
        const domain = response?.domain || API.DEFAULT_DOMAIN;
        const protocol = domain.includes("localhost") ? "http" : "https";
        const loginUrl = `${protocol}://${domain}/login`;
        chrome.runtime.sendMessage({
          action: "openLoginPage",
          url: loginUrl
        }, (response2) => {
          if (chrome.runtime.lastError) {
            console.error("[TweetReplyAI] Failed to open login page:", chrome.runtime.lastError.message);
          }
        });
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to get API domain, using fallback:", error2);
        const loginUrl = API.LOGIN_URL;
        chrome.runtime.sendMessage({
          action: "openLoginPage",
          url: loginUrl
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("[TweetReplyAI] Failed to open login page:", chrome.runtime.lastError.message);
          }
        });
      }
    }
    insertButtonInToolbar(toolbar, button) {
      if (toolbar.firstChild) {
        toolbar.insertBefore(button, toolbar.firstChild);
      } else {
        toolbar.appendChild(button);
      }
    }
    truncateToMaxChars(value, max = 1e3) {
      if (typeof value !== "string") return value;
      return value.length > max ? value.slice(0, max) : value;
    }
    sanitizeThreadContextForApi(threadContext, max = 1e3) {
      if (!threadContext || typeof threadContext !== "object") return threadContext;
      const safeOriginalTweet = threadContext.originalTweet === null || threadContext.originalTweet === void 0 ? null : this.truncateToMaxChars(threadContext.originalTweet, max);
      const safeThreadChain = Array.isArray(threadContext.threadChain) ? threadContext.threadChain.map((item) => {
        if (!item || typeof item !== "object") return item;
        return {
          ...item,
          text: typeof item.text === "string" ? this.truncateToMaxChars(item.text, max) : item.text
        };
      }) : threadContext.threadChain;
      return {
        ...threadContext,
        originalTweet: safeOriginalTweet,
        threadChain: safeThreadChain
      };
    }
    async handleSuggestReply(composer, button, options = {}) {
      if (!this.isAuthenticated) {
        this.showMessage(composer, `Please sign in to use ${APP_DISPLAY_NAME}`, "error");
        return;
      }
      if (!this.usageData || this.usageData.used >= this.usageData.limit) {
        this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", "info");
        return;
      }
      const tweetText = this.extractTweetText();
      if (!tweetText) {
        this.showMessage(composer, "Could not find the tweet to reply to", "error");
        return;
      }
      const tweetId = this.extractTweetId();
      if (!tweetId) {
        console.error("[TweetReplyAI] Failed to extract tweet ID");
        this.showMessage(composer, "Could not identify the tweet. Try refreshing the page.", "error");
        return;
      }
      if (DIAGNOSE_THREAD_SELECTION) {
        const statusIdFromUrl = this.getStatusIdFromDetailPageUrl();
        console.log("[TweetReplyAI] DIAG URL pathname:", window.location.pathname);
        console.log("[TweetReplyAI] DIAG lastNonComposePath:", this.lastNonComposePath);
        console.log("[TweetReplyAI] DIAG isTweetDetailPage:", this.isTweetDetailPage());
        console.log("[TweetReplyAI] DIAG URL statusId:", statusIdFromUrl ?? "null");
        console.log("[TweetReplyAI] DIAG reply-target tweetId (API):", tweetId);
        if (statusIdFromUrl && tweetId) {
          console.log("[TweetReplyAI] DIAG statusId === tweetId?", statusIdFromUrl === tweetId);
        }
      }
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #1d9bf0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Generating...</span>
    `;
      try {
        const authorInfo = this.extractAuthorInfo();
        const threadContext = this.extractThreadContext();
        const tweetMetadata = this.extractTweetMetadata();
        console.log("[TweetReplyAI] \u{1F4CA} Thread Context Summary:", {
          isReply: threadContext?.isReply || false,
          hasOriginalTweet: !!threadContext?.originalTweet,
          originalTweetAuthor: threadContext?.originalTweetAuthor || "none",
          threadLength: threadContext?.threadLength || 0,
          currentTweetIndex: threadContext?.currentTweetIndex || 0
        });
        if (threadContext?.isReply && threadContext?.originalTweet) {
          console.log("[TweetReplyAI] \u{1F4CB} QUICK THREAD PREVIEW:");
          console.log("[TweetReplyAI] Original:", threadContext.originalTweet.substring(0, 100) + (threadContext.originalTweet.length > 100 ? "..." : ""));
          if (threadContext.threadChain && threadContext.threadChain.length > 0) {
            console.log("[TweetReplyAI] Thread chain:", threadContext.threadChain.map(
              (t) => (t.isOriginal ? "\u{1F535}" : t.isCurrent ? "\u{1F7E2}" : "\u26AA") + " " + t.text.substring(0, 60) + (t.text.length > 60 ? "..." : "")
            ));
          }
        }
        console.log("[TweetReplyAI] Generating reply with data:", {
          tweet_id: tweetId,
          tweet_text_length: tweetText.length,
          author_info_username: authorInfo?.username || "unknown",
          model_key: options.modelKey || "auto",
          prompt_variation: options.promptVariation || "default",
          is_reply: threadContext?.isReply || false,
          thread_length: threadContext?.threadLength || 0
        });
        console.log("[TweetReplyAI] \u{1F916} Starting AI-powered tweet analysis (server-side)...");
        const sanitizedThreadContext = this.sanitizeThreadContextForApi(threadContext, 1e3);
        const conversationContext = sanitizedThreadContext?.threadChain?.map((t) => t.text) || null;
        const response = await this.apiClient.generateReply({
          tweet_text: tweetText,
          tweet_id: tweetId,
          // Now guaranteed to be non-null
          model_key: options.modelKey,
          reply_mode: options.replyMode,
          // Reply generation mode
          prompt_variation: options.promptVariation,
          author_info: authorInfo,
          // Now guaranteed to have follower_count as number
          thread_context: sanitizedThreadContext,
          // NEW: Structured thread data
          conversation_context: conversationContext,
          // Backward compatibility
          tweet_metadata: tweetMetadata
        });
        if (response.analysis) {
          console.log("[TweetReplyAI] \u2705 Tweet analysis completed:", {
            tone: response.analysis.tone || "unknown",
            sentiment: response.analysis.sentiment || "unknown",
            style: response.analysis.style || "unknown",
            intention: response.analysis.intention ? response.analysis.intention.substring(0, 80) + "..." : "N/A"
          });
        } else {
          console.log("[TweetReplyAI] \u2139\uFE0F No analysis data in response (using basic context)");
        }
        await this.insertReplyIntoComposer(composer, {
          reply: response.reply,
          qualityScore: response.qualityScore
        });
        try {
          await this.maybeAutoAppendCtaAfterAiInsert(composer);
        } catch (ctaErr) {
          console.warn("[TweetReplyAI] Auto-append CTA failed:", ctaErr);
        }
        this.usageData = {
          ...this.usageData,
          used: response.used,
          limit: response.limit,
          resetAt: response.resetAt
        };
        try {
          chrome.runtime.sendMessage({ action: "usageUpdated" }).catch(() => {
          });
        } catch (error2) {
        }
        this.updateAllButtonStates();
      } catch (error2) {
        console.error("Failed to generate reply:", error2);
        emitTelemetry({
          event_type: "api_request_failed",
          surface: "content",
          route: "/api/generate-reply",
          error_code: error2?.message || "generate_reply_failed"
        });
        if (error2?.message?.includes("401")) {
          this.authManager.signOut().catch((err) => {
            console.error("Failed to sign out on 401:", err);
          });
          this.isAuthenticated = false;
        }
        const { message: baseMessage } = getUserFacingError(
          error2,
          "Something went wrong. Try again."
        );
        let errorMessage = baseMessage;
        if (error2?.message?.includes("400")) {
          errorMessage = "Invalid request. Please try again or refresh the page.";
        }
        this.showMessage(composer, errorMessage, "error");
      } finally {
        button.innerHTML = originalText;
        button.disabled = false;
        this.updateButtonState(button);
      }
    }
    async handleSuggestReplyFromPopup() {
      const composers = document.querySelectorAll('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"]');
      for (const composer of composers) {
        if (this.isComposerVisible(composer)) {
          const button = this.findButtonForComposer(composer);
          if (button && !button.disabled) {
            await this.handleSuggestReply(composer, button);
            break;
          }
        }
      }
    }
    /**
     * Fix: prefer focused composer, then first visible reply box (plan: active composer, not random query).
     */
    findActiveReplyComposer() {
      const candidates = document.querySelectorAll(
        '[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_1"], [data-testid="tweetTextarea_2"]'
      );
      const active = document.activeElement;
      for (const el of Array.from(candidates)) {
        if (active && (el === active || el.contains(active))) {
          return el;
        }
      }
      for (const el of Array.from(candidates)) {
        if (this.isComposerVisible(el)) return el;
      }
      return null;
    }
    /** Toolbar scope for locating injected TweetReply buttons (same as findButtonForComposer). */
    findComposerButtonContainer(composer) {
      return composer?.closest?.('[data-testid="tweetComposer"]') || composer?.parentElement || null;
    }
    findImproveButtonForComposer(composer) {
      const container = this.findComposerButtonContainer(composer);
      return container?.querySelector(".tweetreply-improve-btn") || null;
    }
    /**
     * Fix: plan UX — minimal hint when no composer (cannot use showMessage without a composer parent).
     */
    showTransientPageMessage(message, type = "info") {
      const el = document.createElement("div");
      el.className = `tweetreply-message tweetreply-message--${type}`;
      el.setAttribute("role", "status");
      el.textContent = message;
      el.style.cssText = "position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483646;max-width:90vw;padding:10px 14px;border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.25);";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4e3);
    }
    async handleShortcutCommand(command) {
      const composer = this.findActiveReplyComposer();
      if (!composer) {
        emitTelemetry({
          event_type: "composer_injection_failed",
          surface: "content",
          error_code: "shortcut_no_composer",
          context: { action: command }
        });
        this.showTransientPageMessage("Open a reply composer on X first, then try the shortcut again.");
        return;
      }
      const actualComposer = composer.querySelector?.('[contenteditable="true"]') || composer.querySelector?.(".public-DraftEditor-content") || composer;
      if (command === "suggest_reply") {
        const suggestBtn = this.findButtonForComposer(composer);
        if (!suggestBtn) {
          emitTelemetry({
            event_type: "composer_injection_failed",
            surface: "content",
            error_code: "shortcut_no_suggest_button",
            context: { action: command }
          });
          this.showMessage(
            actualComposer,
            "Wait for TweetReply buttons to appear on this composer, then try again.",
            "info"
          );
          return;
        }
        await this.handleSuggestReply(composer, suggestBtn);
        return;
      }
      if (command === "improve_draft") {
        const improveBtn = this.findImproveButtonForComposer(composer);
        if (!improveBtn) {
          emitTelemetry({
            event_type: "composer_injection_failed",
            surface: "content",
            error_code: "shortcut_no_improve_button",
            context: { action: command }
          });
          this.showMessage(
            actualComposer,
            "Wait for TweetReply buttons to appear on this composer, then try again.",
            "info"
          );
          return;
        }
        await this.handleImproveReply(composer, improveBtn);
        return;
      }
      if (command === "insert_default_snippet") {
        const { defaultSnippet, legacyText } = await this.getSnippetLibraryState();
        const snippetText = defaultSnippet?.text || legacyText;
        if (!snippetText) {
          this.showMessage(actualComposer, "No default snippet set in extension settings.", "info");
          return;
        }
        await this.appendCtaSnippetToComposer(actualComposer, snippetText);
      }
    }
    async handleImproveReply(composer, button) {
      if (!this.isAuthenticated) {
        this.showMessage(composer, `Please sign in to use ${APP_DISPLAY_NAME}`, "error");
        return;
      }
      if (!this.usageData || this.usageData.used >= this.usageData.limit) {
        this.showMessage(composer, "You've used all your credits! Upgrade to keep the replies flowing.", "info");
        return;
      }
      let draftText = "";
      const dataTextSpans = composer.querySelectorAll('[data-text="true"]');
      if (dataTextSpans.length > 0) {
        draftText = Array.from(dataTextSpans).map((span) => span.textContent || span.innerText).join(" ").trim();
      }
      if (!draftText || draftText.length === 0) {
        draftText = composer.textContent || composer.innerText || "";
      }
      if (!draftText || draftText.length === 0) {
        const contentEditable = composer.querySelector('[contenteditable="true"]');
        if (contentEditable) {
          draftText = contentEditable.textContent || contentEditable.innerText || "";
        }
      }
      draftText = draftText.trim();
      if (!draftText || draftText.length === 0) {
        this.showMessage(composer, "Please write a draft reply first", "info");
        return;
      }
      button.disabled = true;
      const originalText = button.innerHTML;
      button.innerHTML = `
      <div class="tweetreply-spinner" style="width: 14px; height: 14px; border: 2px solid #3b82f6; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 4px;"></div>
      <span>Improving...</span>
    `;
      try {
        const originalTweetText = this.extractTweetText() || "";
        console.log("[TweetReplyAI] Improving draft:", {
          draftLength: draftText.length,
          originalTweetLength: originalTweetText.length
        });
        const container = button.closest(".tweetreply-button-container");
        const modelSelect = container?.querySelector(".tweetreply-model-select");
        const modelKey = modelSelect?.value || "auto";
        const response = await this.apiClient.suggestImprovements(draftText, originalTweetText, {
          model_key: modelKey === "auto" ? void 0 : modelKey
        });
        console.log("[TweetReplyAI] API response received:", response);
        console.log("[TweetReplyAI] Response keys:", Object.keys(response || {}));
        let improvedDraft = "";
        if (response && response.improved) {
          improvedDraft = response.improved;
        } else if (typeof response === "string") {
          improvedDraft = response;
        } else if (response && response.improvedDraft) {
          improvedDraft = response.improvedDraft;
        } else if (response && response.improved_reply) {
          improvedDraft = response.improved_reply;
        } else if (response && response.reply) {
          improvedDraft = response.reply;
        } else if (response && response.suggestion) {
          improvedDraft = response.suggestion;
        } else {
          improvedDraft = Object.values(response).find((v) => typeof v === "string") || draftText;
        }
        console.log("[TweetReplyAI] Extracted improved draft:", improvedDraft);
        if (!improvedDraft || improvedDraft.trim().length === 0) {
          throw new Error("No improved draft received from API");
        }
        await this.insertReplyIntoComposer(composer, improvedDraft);
        try {
          await this.maybeAutoAppendCtaAfterAiInsert(composer);
        } catch (ctaErr) {
          console.warn("[TweetReplyAI] Auto-append CTA failed:", ctaErr);
        }
        if (response.usage) {
          this.usageData = {
            ...this.usageData,
            used: response.usage.used,
            limit: response.usage.limit || this.usageData.limit,
            resetAt: response.usage.resetAt || this.usageData.resetAt
          };
        } else if (response.used !== void 0) {
          this.usageData = {
            ...this.usageData,
            used: response.used,
            limit: response.limit || this.usageData.limit,
            resetAt: response.resetAt || this.usageData.resetAt
          };
        }
        if (response.usage || response.used !== void 0) {
          try {
            chrome.runtime.sendMessage({ action: "usageUpdated" }).catch(() => {
            });
          } catch (error2) {
          }
        }
        this.updateAllButtonStates();
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to improve reply:", error2);
        emitTelemetry({
          event_type: "api_request_failed",
          surface: "content",
          route: "/api/suggest-improvements",
          error_code: error2?.message || "improve_reply_failed"
        });
        console.error("[TweetReplyAI] Error details:", {
          message: error2?.message,
          stack: error2?.stack,
          response: error2?.response
        });
        if (error2?.message?.includes("401")) {
          this.authManager.signOut().catch((err) => {
            console.error("Failed to sign out on 401:", err);
          });
          this.isAuthenticated = false;
        }
        const { message: baseMessage } = getUserFacingError(
          error2,
          "Something went wrong. Try again."
        );
        let errorMessage = baseMessage;
        if (error2?.message?.includes("400")) {
          errorMessage = "Invalid request. Please try again or refresh the page.";
        }
        this.showMessage(composer, errorMessage, "error");
      } finally {
        button.innerHTML = originalText;
        button.disabled = false;
        this.updateButtonState(button);
      }
    }
    isComposerVisible(composer) {
      const rect = composer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    }
    findButtonForComposer(composer) {
      const container = composer.closest('[data-testid="tweetComposer"]') || composer.parentElement;
      return container?.querySelector(".tweetreply-suggest-btn");
    }
    extractTweetText() {
      if (/\/compose\/post/.test(window.location.pathname)) {
        const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
        if (dialogArticle) {
          const tweetTextEl = dialogArticle.querySelector('[data-testid="tweetText"]');
          if (tweetTextEl) {
            const text = extractTweetPlainText(tweetTextEl);
            if (text && text.length > 10) return text;
          }
        }
      }
      if (this.currentReplyTargetArticle && document.contains(this.currentReplyTargetArticle)) {
        const tweetTextEl = this.currentReplyTargetArticle.querySelector('[data-testid="tweetText"]');
        if (tweetTextEl) {
          const text = extractTweetPlainText(tweetTextEl);
          if (text && text.length > 10) return text;
        }
      }
      if (this.isTweetDetailPage()) {
        const statusId = this.getStatusIdFromDetailPageUrl();
        if (statusId) {
          const focalArticle = this.findOriginalTweetArticleByStatusId(statusId);
          if (focalArticle) {
            const data = this.extractTextAndAuthorFromArticle(focalArticle);
            if (data?.text && data.text.length > 10) return data.text;
          }
        }
      }
      const tweetSelectors = [
        '[data-testid="tweet"] [data-testid="tweetText"]',
        ".tweet-text",
        "[lang] span"
        // Twitter uses lang attribute on tweet text
      ];
      for (const selector of tweetSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent?.trim();
          if (text && text.length > 10) return text;
        }
      }
      try {
        const draftSpans = document.querySelectorAll('span[data-text="true"]');
        if (draftSpans.length > 0) {
          const text = Array.from(draftSpans).map((span) => span.textContent || "").join(" ").trim();
          if (text && text.length > 10) return text;
        }
      } catch (error2) {
        console.warn("[TweetReplyAI] Draft.js span extraction failed:", error2);
      }
      try {
        const contentEditables = document.querySelectorAll('[contenteditable="true"]');
        for (const element of contentEditables) {
          if (element.getAttribute("data-testid")?.includes("tweetTextarea") || element.classList.contains("public-DraftEditor-content")) {
            continue;
          }
          const text = element.textContent?.trim();
          if (text && text.length > VALIDATION.MIN_TWEET_LENGTH && text.length < VALIDATION.MAX_TWEET_LENGTH) {
            console.log("[TweetReplyAI] \u2705 Tweet text found via contentEditable");
            return text;
          }
        }
      } catch (error2) {
        console.warn("[TweetReplyAI] contentEditable extraction failed:", error2);
      }
      try {
        const draftBlocks = document.querySelectorAll(".public-DraftStyleDefault-block");
        if (draftBlocks.length > 0) {
          const text = Array.from(draftBlocks).map((block) => block.textContent || "").join("\n").trim();
          if (text && text.length > 10) {
            console.log("[TweetReplyAI] \u2705 Tweet text found via Draft.js blocks");
            return text;
          }
        }
      } catch (error2) {
        console.warn("[TweetReplyAI] Draft.js block extraction failed:", error2);
      }
      try {
        const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        for (const tweet of tweetElements) {
          let currentElement = tweet;
          for (let i = 0; i < 3 && currentElement; i++) {
            const spans = currentElement.querySelectorAll('span[data-text="true"]');
            if (spans.length > 0) {
              const text = Array.from(spans).map((span) => span.textContent || "").join(" ").trim();
              if (text && text.length > 10) {
                console.log("[TweetReplyAI] \u2705 Tweet text found via parent traversal");
                return text;
              }
            }
            currentElement = currentElement.parentElement;
          }
        }
      } catch (error2) {
        console.warn("[TweetReplyAI] Parent traversal extraction failed:", error2);
      }
      try {
        const allText = document.body.textContent;
        const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > VALIDATION.MIN_TWEET_LENGTH);
        if (sentences.length > 0) {
          console.log("[TweetReplyAI] \u2705 Tweet text found via sentence detection");
          return sentences[0]?.trim() || null;
        }
      } catch (error2) {
        console.warn("[TweetReplyAI] Sentence detection failed:", error2);
      }
      console.warn("[TweetReplyAI] \u274C Failed to extract tweet text from any method");
      return null;
    }
    extractTweetId() {
      if (/\/compose\/post/.test(window.location.pathname)) {
        const dialogArticle = this.getReplyTargetArticleFromComposerDialog();
        if (dialogArticle) {
          const ownId = this.getOwnStatusIdFromArticle(dialogArticle);
          if (ownId) {
            console.log("[TweetReplyAI] Tweet ID extracted from composer dialog:", ownId);
            return ownId;
          }
        }
      }
      const urlMatch = window.location.href.match(/status\/(\d+)/);
      if (urlMatch) {
        console.log("[TweetReplyAI] Tweet ID extracted from URL:", urlMatch[1]);
        return urlMatch[1];
      }
      const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
      for (const tweet of tweetElements) {
        const tweetId = tweet.getAttribute("data-tweet-id");
        if (tweetId) {
          console.log("[TweetReplyAI] Tweet ID extracted from data-tweet-id:", tweetId);
          return tweetId;
        }
        const ariaLabel = tweet.getAttribute("aria-labelledby");
        if (ariaLabel) {
          const match = ariaLabel.match(/(\d{15,})/);
          if (match) {
            console.log("[TweetReplyAI] Tweet ID extracted from aria-labelledby:", match[1]);
            return match[1];
          }
        }
        const tweetLink = tweet.querySelector('a[href*="/status/"]');
        if (tweetLink) {
          const linkMatch = tweetLink.href.match(/status\/(\d+)/);
          if (linkMatch) {
            console.log("[TweetReplyAI] Tweet ID extracted from tweet link:", linkMatch[1]);
            return linkMatch[1];
          }
        }
      }
      const statusLinks = document.querySelectorAll('a[href*="/status/"]');
      for (const link of statusLinks) {
        const linkMatch = link.href.match(/status\/(\d+)/);
        if (linkMatch) {
          console.log("[TweetReplyAI] Tweet ID extracted from status link:", linkMatch[1]);
          return linkMatch[1];
        }
      }
      console.warn("[TweetReplyAI] Failed to extract tweet ID from any source");
      return null;
    }
    parseFollowerCount(countStr) {
      if (!countStr) return 0;
      const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
      const match = countStr.match(/^([\d.]+)([KMB])?$/i);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const suffix = match[2]?.toUpperCase();
      return Math.round(num * (multipliers[suffix] || 1));
    }
    extractAuthorInfo() {
      try {
        const authorElement = document.querySelector('[data-testid="User-Name"]');
        if (!authorElement) {
          console.log("[TweetReplyAI] No author element found, using defaults");
          return {
            username: "unknown",
            verified: false,
            follower_count: 0
            // Fallback value
          };
        }
        const fullText = authorElement.textContent?.trim() || "unknown";
        let username = "unknown";
        let displayName = null;
        let postedTime = null;
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          [, displayName, username, postedTime] = match;
          username = username.trim();
          displayName = displayName.trim();
          postedTime = postedTime.trim();
        } else {
          match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
          if (match) {
            [, username, postedTime] = match;
            username = username.trim();
            postedTime = postedTime.trim();
          } else {
            username = fullText;
          }
        }
        const verifiedIcon = authorElement.querySelector('[data-testid="icon-verified"]');
        const isVerified = !!verifiedIcon;
        let followerCount = 0;
        const tweetArticle = authorElement.closest('article[data-testid="tweet"]') || authorElement.closest("article");
        if (tweetArticle) {
          const followerMatch = tweetArticle.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
          if (followerMatch) {
            followerCount = this.parseFollowerCount(followerMatch[1]);
            console.log("[TweetReplyAI] Follower count extracted from tweet article:", followerCount);
          }
        }
        if (followerCount === 0) {
          const bioElement = document.querySelector('[data-testid="UserDescription"]');
          if (bioElement) {
            const followerMatch = bioElement.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
            if (followerMatch) {
              followerCount = this.parseFollowerCount(followerMatch[1]);
              console.log("[TweetReplyAI] Follower count extracted from bio:", followerCount);
            }
          }
        }
        if (followerCount === 0) {
          const hoverCard = document.querySelector('[data-testid="HoverCard"]');
          if (hoverCard) {
            const followerMatch = hoverCard.textContent?.match(/(\d+(?:\.\d+)?[KMB]?)\s*followers?/i);
            if (followerMatch) {
              followerCount = this.parseFollowerCount(followerMatch[1]);
              console.log("[TweetReplyAI] Follower count extracted from hover card:", followerCount);
            }
          }
        }
        console.log("[TweetReplyAI] Author info extracted:", {
          username,
          display_name: displayName,
          posted_time: postedTime,
          verified: isVerified,
          follower_count: followerCount
        });
        return {
          username,
          verified: isVerified,
          follower_count: followerCount
          // Always returns a number
        };
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to extract author info:", error2);
        return {
          username: "unknown",
          verified: false,
          follower_count: 0
        };
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Storage & Configuration Helpers
    // ============================================================================
    // Get tracking settings with defaults
    async getTrackingSettings() {
      try {
        const result = await chrome.storage.local.get(["replyTrackingSettings"]);
        const settings = result.replyTrackingSettings || {
          trackingPeriodDays: DEFAULTS.TRACKING_DAYS
        };
        return {
          trackingPeriodDays: Math.max(DEFAULTS.TRACKING_DAYS_MIN, Math.min(DEFAULTS.TRACKING_DAYS_MAX, parseInt(settings.trackingPeriodDays) || DEFAULTS.TRACKING_DAYS))
        };
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to get tracking settings:", error2);
        return { trackingPeriodDays: DEFAULTS.TRACKING_DAYS };
      }
    }
    // Set tracking settings
    async setTrackingSettings(settings) {
      try {
        await chrome.storage.local.set({ replyTrackingSettings: settings });
      } catch (error2) {
        console.error("[TweetReplyAI] Failed to save tracking settings:", error2);
      }
    }
    // Get reply history
    async getReplyHistory() {
      try {
        const result = await chrome.storage.local.get(["replyHistory"]);
        return result.replyHistory || {};
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to get reply history:", error2);
        return {};
      }
    }
    // Track reply to a user
    async trackReply(username) {
      if (!username || username === "unknown") return;
      const lockKey = `tracking_${username}`;
      if (this[lockKey]) {
        return;
      }
      this[lockKey] = true;
      try {
        const history2 = await this.getReplyHistory();
        const settings = await this.getTrackingSettings();
        const now = Date.now();
        if (!history2[username]) {
          history2[username] = { replies: [] };
        }
        if (history2[username].hidden !== void 0) {
          delete history2[username].hidden;
        }
        if (history2[username].hideUntil !== void 0) {
          delete history2[username].hideUntil;
        }
        const recentReply = history2[username].replies.find(
          (r) => Math.abs(r.timestamp - now) < 1e3
        );
        if (recentReply) {
          return;
        }
        history2[username].replies.push({ timestamp: now });
        const cutoff = now - settings.trackingPeriodDays * AUTH.ONE_DAY_MS;
        history2[username].replies = history2[username].replies.filter(
          (r) => r.timestamp > cutoff
        );
        await chrome.storage.local.set({ replyHistory: history2 });
        await this.updateReplyCountsOnTweets();
      } catch (error2) {
        console.error("[TweetReplyAI] Error tracking reply:", error2);
      } finally {
        delete this[lockKey];
      }
    }
    // Cleanup expired history
    async cleanupExpiredHistory() {
      const history2 = await this.getReplyHistory();
      const settings = await this.getTrackingSettings();
      const cutoff = Date.now() - settings.trackingPeriodDays * AUTH.ONE_DAY_MS;
      let hasChanges = false;
      for (const [username, data] of Object.entries(history2)) {
        const originalCount = data.replies?.length || 0;
        data.replies = (data.replies || []).filter((r) => r.timestamp > cutoff);
        if (data.hidden !== void 0) {
          delete data.hidden;
          hasChanges = true;
        }
        if (data.hideUntil !== void 0) {
          delete data.hideUntil;
          hasChanges = true;
        }
        if (data.replies.length === 0) {
          delete history2[username];
          hasChanges = true;
        } else if (data.replies.length !== originalCount) {
          hasChanges = true;
        }
      }
      if (hasChanges) {
        await chrome.storage.local.set({ replyHistory: history2 });
        await this.updateReplyCountsOnTweets();
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Username Extraction from Tweet
    // ============================================================================
    // Extract username from specific tweet article
    async extractUsernameFromTweet(tweetArticle) {
      try {
        const authorElement = tweetArticle.querySelector('[data-testid="User-Name"]');
        if (!authorElement) return null;
        const fullText = authorElement.textContent?.trim() || "";
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[2].trim();
        }
        match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[1].trim();
        }
        const usernameMatch = fullText.match(/@([^\s\u00B7·.]+)/);
        if (usernameMatch) {
          return usernameMatch[1];
        }
        return null;
      } catch (error2) {
        console.warn("[TweetReplyAI] Failed to extract username from tweet:", error2);
        return null;
      }
    }
    // Sync version for immediate checks
    extractUsernameFromTweetSync(tweetArticle) {
      try {
        const authorElement = tweetArticle.querySelector('[data-testid="User-Name"]');
        if (!authorElement) return null;
        const fullText = authorElement.textContent?.trim() || "";
        let match = fullText.match(/^(.+?)@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[2].trim();
        }
        match = fullText.match(/^@([^\u00B7·.\s]+)\s*[\u00B7·.]\s*(.+)$/);
        if (match) {
          return match[1].trim();
        }
        const usernameMatch = fullText.match(/@([^\s\u00B7·.]+)/);
        if (usernameMatch) {
          return usernameMatch[1];
        }
        return null;
      } catch (error2) {
        return null;
      }
    }
    // ============================================================================
    // REPLY TRACKING & COUNT DISPLAY - Reply Count Display System
    // ============================================================================
    // Get reply count for a user within last N days
    async getReplyCountForUser(username, days) {
      if (!username || username === "unknown") return 0;
      try {
        const history2 = await this.getReplyHistory();
        const userData = history2[username];
        if (!userData || !userData.replies || userData.replies.length === 0) {
          return 0;
        }
        const now = Date.now();
        const cutoff = now - days * AUTH.ONE_DAY_MS;
        const count = userData.replies.filter((r) => r.timestamp > cutoff).length;
        return count;
      } catch (error2) {
        console.error("[TweetReplyAI] Error getting reply count:", error2);
        return 0;
      }
    }
    // Get color for reply count badge based on count (gradient from light to dark blue)
    getReplyCountColor(count) {
      if (count === 1) return "#60A5FA";
      if (count <= 3) return "#2563EB";
      if (count <= 5) return "#1E40AF";
      return "#1E3A8A";
    }
    // Show reply count on a tweet near username/author info
    async showReplyCountOnTweet(tweetArticle, username, count = null) {
      if (!tweetArticle || !username || username === "unknown") return;
      const existingIndicator = tweetArticle.querySelector(".tweetreply-reply-count");
      if (existingIndicator) {
        existingIndicator.remove();
      }
      if (count === null) {
        const settings = await this.getTrackingSettings();
        count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
      }
      if (count <= 0) return;
      const userNameElement = tweetArticle.querySelector('[data-testid="User-Name"]');
      if (!userNameElement || !userNameElement.isConnected) return;
      if (!tweetArticle.isConnected) {
        return;
      }
      const color = this.getReplyCountColor(count);
      const indicator = document.createElement("span");
      indicator.className = "tweetreply-reply-count";
      indicator.setAttribute("data-username", username);
      indicator.style.cssText = `
      margin-left: 6px;
      padding: 3px 10px;
      background: ${color};
      color: white;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      display: inline-block;
      transition: background-color 0.2s ease;
    `;
      indicator.textContent = `${count} ${count === 1 ? "reply" : "replies"}`;
      let inserted = false;
      try {
        const timeElement = userNameElement.querySelector("time") || tweetArticle.querySelector("time");
        if (timeElement && timeElement.isConnected) {
          const timeParent = timeElement.parentNode;
          if (!timeParent || !timeParent.isConnected) {
          } else {
            const nextSibling = timeElement.nextSibling;
            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
              if (nextSibling.nextSibling) {
                timeParent.insertBefore(indicator, nextSibling.nextSibling);
              } else {
                timeParent.appendChild(indicator);
              }
            } else {
              const spaceText = document.createTextNode(" ");
              if (nextSibling) {
                timeParent.insertBefore(spaceText, nextSibling);
                timeParent.insertBefore(indicator, nextSibling);
              } else {
                timeParent.appendChild(spaceText);
                timeParent.appendChild(indicator);
              }
            }
            inserted = true;
          }
        } else {
          const userNameText = userNameElement.textContent || "";
          const timeMatch = userNameText.match(/[\u00B7·.]\s*(\d+[hmsdw]?)\b/i);
          if (timeMatch) {
            const walker = document.createTreeWalker(
              userNameElement,
              NodeFilter.SHOW_TEXT,
              null
            );
            let textNode;
            while (textNode = walker.nextNode()) {
              if (textNode.textContent && textNode.textContent.includes(timeMatch[1])) {
                const textParent = textNode.parentElement || textNode.parentNode;
                if (textParent && textParent.isConnected) {
                  const parentContainer = textParent.parentNode;
                  if (parentContainer && parentContainer.isConnected) {
                    const nextSibling = textParent.nextSibling;
                    if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
                      if (nextSibling.nextSibling) {
                        parentContainer.insertBefore(indicator, nextSibling.nextSibling);
                      } else {
                        parentContainer.appendChild(indicator);
                      }
                    } else {
                      const spaceText = document.createTextNode(" ");
                      if (nextSibling) {
                        parentContainer.insertBefore(spaceText, nextSibling);
                        parentContainer.insertBefore(indicator, nextSibling);
                      } else {
                        parentContainer.appendChild(spaceText);
                        parentContainer.appendChild(indicator);
                      }
                    }
                    inserted = true;
                    break;
                  }
                }
              }
            }
            if (!inserted && userNameElement.isConnected) {
              const container = userNameElement.parentElement || userNameElement.parentNode;
              if (container && container.isConnected) {
                const nextSibling = userNameElement.nextSibling;
                if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
                  if (nextSibling.nextSibling) {
                    container.insertBefore(indicator, nextSibling.nextSibling);
                  } else {
                    container.appendChild(indicator);
                  }
                } else {
                  const spaceText = document.createTextNode(" ");
                  if (nextSibling) {
                    container.insertBefore(spaceText, nextSibling);
                    container.insertBefore(indicator, nextSibling);
                  } else {
                    container.appendChild(spaceText);
                    container.appendChild(indicator);
                  }
                }
                inserted = true;
              }
            }
          }
        }
        if (!inserted && userNameElement.isConnected) {
          const parent = userNameElement.parentNode;
          if (parent && parent.isConnected) {
            const nextSibling = userNameElement.nextSibling;
            if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE && nextSibling.textContent.trim() === "") {
              if (nextSibling.nextSibling) {
                parent.insertBefore(indicator, nextSibling.nextSibling);
              } else {
                parent.appendChild(indicator);
              }
            } else {
              const spaceText = document.createTextNode(" ");
              if (nextSibling) {
                parent.insertBefore(spaceText, nextSibling);
                parent.insertBefore(indicator, nextSibling);
              } else {
                parent.appendChild(spaceText);
                parent.appendChild(indicator);
              }
            }
            inserted = true;
          }
        }
      } catch (error2) {
        try {
          if (!userNameElement.isConnected || !tweetArticle.isConnected) {
            return;
          }
          const parent = userNameElement.parentElement || userNameElement.parentNode;
          if (parent && parent.isConnected) {
            const lastChild = parent.lastChild;
            if (lastChild && lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent.trim() === "") {
              parent.insertBefore(indicator, lastChild);
            } else {
              const spaceText = document.createTextNode(" ");
              parent.appendChild(spaceText);
              parent.appendChild(indicator);
            }
          } else {
            if (userNameElement.isConnected) {
              userNameElement.appendChild(indicator);
            }
          }
        } catch (e) {
          console.warn("[TweetReplyAI] Could not insert reply count indicator:", e);
        }
      }
    }
    // Update reply counts on all visible tweets
    async updateReplyCountsOnTweets() {
      if (this.checkingTweets) {
        return;
      }
      this.checkingTweets = true;
      try {
        const settings = await this.getTrackingSettings();
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');
        for (const tweet of tweets) {
          if (!tweet.isConnected) continue;
          const username = this.extractUsernameFromTweetSync(tweet);
          if (username && username !== "unknown") {
            const count = await this.getReplyCountForUser(username, settings.trackingPeriodDays);
            if (!tweet.isConnected) continue;
            if (count > 0) {
              await this.showReplyCountOnTweet(tweet, username, count);
            } else {
              const existingIndicator = tweet.querySelector(".tweetreply-reply-count");
              if (existingIndicator && existingIndicator.isConnected) {
                existingIndicator.remove();
              }
            }
          }
        }
      } catch (error2) {
        console.error("[TweetReplyAI] Error updating reply counts:", error2);
      } finally {
        this.checkingTweets = false;
      }
    }
    // Setup reply count display system
    setupReplyCountDisplay() {
      if (this.countDisplayInitialized) return;
      this.countDisplayInitialized = true;
      this.updateReplyCountsOnTweets();
      if (this.trackingCleanupInterval) {
        clearInterval(this.trackingCleanupInterval);
      }
      this.trackingCleanupInterval = setInterval(() => {
        this.cleanupExpiredHistory();
        this.updateReplyCountsOnTweets();
      }, POLLING.TRACKING_CLEANUP_MS);
    }
    extractConversationContext() {
      try {
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        const parentTweets = [];
        for (let i = 0; i < Math.min(tweets.length, 4); i++) {
          const tweet = tweets[i];
          const tweetText = tweet.querySelector('[data-testid="tweetText"]');
          if (tweetText) {
            const text = tweetText.textContent?.trim();
            if (text && text.length > 10) {
              parentTweets.push(text);
            }
          }
        }
        return parentTweets.length > 0 ? parentTweets : null;
      } catch (error2) {
        console.error("Failed to extract conversation context:", error2);
        return null;
      }
    }
    /**
     * Extract comprehensive thread context including original tweet and full thread chain
     * Returns structured data about the conversation thread
     */
    extractThreadContext() {
      const DEBUG_THREAD_CONTEXT = false;
      try {
        if (DEBUG_THREAD_CONTEXT) {
          console.log("[TweetReplyAI] \u{1F50D} ========== EXTRACTING THREAD CONTEXT ==========");
          console.log("[TweetReplyAI] \u{1F50D} Starting thread context extraction...");
        }
        const currentTweetText = this.extractTweetText();
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReplyAI] \u{1F50D} Current tweet text length:", currentTweetText?.length || 0);
        if (!currentTweetText) {
          console.warn("[TweetReplyAI] \u26A0\uFE0F No current tweet found, returning standalone context");
          return {
            isReply: false,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [],
            currentTweetIndex: 0,
            threadLength: 0
          };
        }
        const isDetailPage = this.isTweetDetailPage();
        if (DIAGNOSE_THREAD_SELECTION) {
          const currentPath = window.location.pathname;
          const effectivePath = /\/compose\//.test(currentPath) ? this.lastNonComposePath : currentPath;
          const statusIdHere = this.getStatusIdFromDetailPageUrl();
          console.log("[TweetReplyAI] DIAG extractThreadContext path:", currentPath, "| lastNonComposePath:", this.lastNonComposePath, "| effectivePath:", effectivePath);
          console.log("[TweetReplyAI] DIAG statusId:", statusIdHere ?? "null");
          console.log("[TweetReplyAI] DIAG currentTweetText preview:", (currentTweetText || "").substring(0, 80) + (currentTweetText && currentTweetText.length > 80 ? "..." : ""));
          console.log("[TweetReplyAI] DIAG currentReplyTargetArticle set?", !!this.currentReplyTargetArticle);
        }
        if (!isDetailPage) {
          if (DEBUG_THREAD_CONTEXT) console.log("[TweetReplyAI] Not on detail page, using single-tweet context only");
          const authorInfo = this.extractAuthorInfo();
          return {
            isReply: true,
            originalTweet: currentTweetText,
            originalTweetAuthor: authorInfo?.username || "unknown",
            threadChain: [{
              text: currentTweetText,
              author: authorInfo?.username || "unknown",
              isOriginal: true,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const isReply = this.detectReplyContext();
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReplyAI] Reply context detected:", isReply);
        if (!isReply) {
          return {
            isReply: false,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: true,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const threadContainer = this.findThreadContainer();
        if (DIAGNOSE_THREAD_SELECTION) {
          if (!threadContainer) {
            console.log("[TweetReplyAI] DIAG findThreadContainer: null");
          } else {
            const articles = threadContainer.querySelectorAll('article[data-testid="tweet"]');
            const desc = threadContainer.tagName.toLowerCase() + (threadContainer.className ? "." + (typeof threadContainer.className === "string" ? threadContainer.className.split(/\s+/)[0] : "") : "") + (threadContainer.getAttribute?.("data-testid") ? '[data-testid="' + threadContainer.getAttribute("data-testid") + '"]' : "");
            console.log("[TweetReplyAI] DIAG findThreadContainer: element=", desc, "| tweet count=", articles.length);
            if (articles.length >= 1) {
              const firstAuthor = (articles[0].querySelector('[data-testid="User-Name"]')?.textContent || "").match(/@([A-Za-z0-9_]+)/);
              const lastAuthor = articles.length > 1 ? (articles[articles.length - 1].querySelector('[data-testid="User-Name"]')?.textContent || "").match(/@([A-Za-z0-9_]+)/) : null;
              console.log("[TweetReplyAI] DIAG container first author:", firstAuthor ? "@" + firstAuthor[1] : "unknown", "| last author:", lastAuthor ? "@" + lastAuthor[1] : "n/a");
            }
          }
        }
        if (!threadContainer) {
          console.log("[TweetReplyAI] \u26A0\uFE0F Thread container not found, using current tweet only");
          return {
            isReply: true,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: false,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const threadTweets = this.extractTweetsFromContainer(threadContainer);
        if (DEBUG_THREAD_CONTEXT) console.log("[TweetReplyAI] Found", threadTweets.length, "tweets in thread");
        if (DIAGNOSE_THREAD_SELECTION && threadTweets.length > 0) {
          threadTweets.forEach((t, i) => {
            const preview = (t.text || "").substring(0, 50) + (t.text && t.text.length > 50 ? "..." : "");
            console.log("[TweetReplyAI] DIAG threadTweets[" + i + "]: author=@" + (t.author || "unknown") + " statusId=" + (t.statusId ?? "null") + ' text="' + preview + '"');
          });
        }
        if (threadTweets.length === 0) {
          return {
            isReply: true,
            originalTweet: null,
            originalTweetAuthor: null,
            threadChain: [{
              text: currentTweetText,
              author: this.extractAuthorInfo()?.username || "unknown",
              isOriginal: false,
              isCurrent: true
            }],
            currentTweetIndex: 0,
            threadLength: 1
          };
        }
        const statusId = this.getStatusIdFromDetailPageUrl();
        let originalTweet = null;
        let tierUsed = null;
        if (statusId) {
          if (this._originalTweetCache && this._originalTweetCache.statusId !== statusId) {
            this._originalTweetCache = null;
          }
          const urlOriginalArticle = this.findOriginalTweetArticleByStatusId(statusId);
          if (urlOriginalArticle) {
            const domOriginal = this.extractTextAndAuthorFromArticle(urlOriginalArticle);
            if (domOriginal) {
              originalTweet = domOriginal;
              tierUsed = "Tier 1 DOM";
              this._originalTweetCache = { statusId, text: domOriginal.text, author: domOriginal.author, fromDom: true };
            }
          }
          if (!originalTweet && this._originalTweetCache?.statusId === statusId && this._originalTweetCache.fromDom) {
            originalTweet = { text: this._originalTweetCache.text, author: this._originalTweetCache.author };
            tierUsed = "Tier 1b cache";
          }
          if (!originalTweet) {
            const byId = threadTweets.find((t) => t.statusId === statusId);
            if (byId) {
              originalTweet = { text: byId.text, author: byId.author };
              tierUsed = "Tier 2 threadList";
              this._originalTweetCache = { statusId, text: byId.text, author: byId.author, fromDom: true };
            }
          }
          if (!originalTweet) {
            const meta = this.getOriginalTweetFromPageMeta();
            if (meta?.statusId === statusId) {
              originalTweet = { text: meta.text, author: meta.author };
              tierUsed = "Tier 3 meta";
              if (!this._originalTweetCache) {
                this._originalTweetCache = { statusId, text: meta.text, author: meta.author, fromDom: false };
              }
            }
          }
          if (!originalTweet) {
            const pathMatch = (/\/compose\//.test(window.location.pathname) ? this.lastNonComposePath : window.location.pathname).match(/^\/([A-Za-z0-9_]+)\/status\/\d+/);
            originalTweet = { text: null, author: pathMatch ? pathMatch[1] : "unknown" };
            tierUsed = "lastResort";
          }
        } else {
          originalTweet = threadTweets[0] || { text: null, author: "unknown" };
          tierUsed = "threadTweets[0]";
        }
        let originalWasOverridden = false;
        if (originalTweet?.text && currentTweetText && originalTweet.text.trim() === currentTweetText.trim()) {
          const ancestor = threadTweets.find(
            (t) => t.text && t.text.trim() !== currentTweetText.trim()
          );
          if (ancestor) {
            originalTweet = { text: ancestor.text, author: ancestor.author };
            originalWasOverridden = true;
          }
        }
        if (DIAGNOSE_THREAD_SELECTION && tierUsed) {
          const otPreview = (originalTweet?.text || "").substring(0, 60) + (originalTweet?.text && originalTweet.text.length > 60 ? "..." : "");
          console.log("[TweetReplyAI] DIAG originalTweet from:", tierUsed, "| author=@" + (originalTweet?.author || "unknown"), '| text="' + otPreview + '"');
          if (originalWasOverridden) {
            console.log("[TweetReplyAI] DIAG same-tweet override: new author=@" + (originalTweet?.author || "unknown"), '| text="' + otPreview + '"');
          }
        }
        let currentTweetIndex = this.findCurrentTweetIndex(threadTweets, currentTweetText);
        if (currentTweetIndex < 0) {
          currentTweetIndex = threadTweets.length - 1;
          console.warn("[TweetReplyAI] \u26A0\uFE0F Current tweet not found in thread, defaulting to last tweet");
        }
        if (DIAGNOSE_THREAD_SELECTION) {
          const ct = threadTweets[currentTweetIndex];
          const ctPreview = ct ? (ct.text || "").substring(0, 50) + (ct.text && ct.text.length > 50 ? "..." : "") : "n/a";
          console.log("[TweetReplyAI] DIAG currentTweetIndex:", currentTweetIndex, "| author=", ct ? "@" + (ct.author || "unknown") : "n/a", '| text="' + ctPreview + '"');
        }
        const threadChain = threadTweets.map((tweet, index) => ({
          text: tweet.text,
          author: tweet.author || "unknown",
          isOriginal: !originalWasOverridden && statusId && tweet.statusId === statusId || !!originalTweet.text && tweet.text === originalTweet.text && (tweet.author || "unknown") === (originalTweet.author || "unknown"),
          isCurrent: index === currentTweetIndex
        }));
        let limitedChain = threadChain;
        let totalChars = threadChain.reduce((sum, t) => sum + t.text.length, 0);
        if (threadChain.length > VALIDATION.MAX_THREAD_CHAIN || totalChars > VALIDATION.MAX_THREAD_CHARS) {
          let originalIndex = !originalWasOverridden && statusId ? threadTweets.findIndex((t) => t.statusId === statusId) : -1;
          if (originalIndex < 0 && originalTweet.text) {
            originalIndex = threadTweets.findIndex((t) => t.text === originalTweet.text && (t.author || "unknown") === (originalTweet.author || "unknown"));
          }
          const keepIndices = /* @__PURE__ */ new Set([...originalIndex >= 0 ? [originalIndex] : [], currentTweetIndex]);
          const recentIndices = [];
          for (let i = Math.max(1, threadChain.length - 2); i < threadChain.length; i++) {
            if (i !== currentTweetIndex) recentIndices.push(i);
          }
          recentIndices.slice(0, 2).forEach((idx) => keepIndices.add(idx));
          limitedChain = threadChain.filter((_, idx) => keepIndices.has(idx));
        }
        let recalculatedCurrentIndex = limitedChain.findIndex((tweet) => tweet.isCurrent);
        if (recalculatedCurrentIndex < 0) {
          const currentTextPrefix = currentTweetText.substring(0, 50).toLowerCase();
          recalculatedCurrentIndex = limitedChain.findIndex(
            (tweet) => tweet.text === currentTweetText || tweet.text.substring(0, 50).toLowerCase() === currentTextPrefix
          );
        }
        if (recalculatedCurrentIndex < 0) {
          recalculatedCurrentIndex = limitedChain.length - 1;
          console.warn("[TweetReplyAI] \u26A0\uFE0F Could not find current tweet in limited chain, using last tweet");
        }
        const result = {
          isReply: true,
          originalTweet: originalTweet.text || null,
          originalTweetAuthor: originalTweet.author || null,
          threadChain: limitedChain,
          currentTweetIndex: recalculatedCurrentIndex,
          // FIX: Use recalculated index
          threadLength: limitedChain.length
        };
        if (DIAGNOSE_THREAD_SELECTION) {
          const origPreview = (result.originalTweet || "").substring(0, 80) + (result.originalTweet && result.originalTweet.length > 80 ? "..." : "");
          console.log("[TweetReplyAI] DIAG final chain: originalTweetAuthor=@" + (result.originalTweetAuthor || "none") + ' | originalTweet="' + origPreview + '" | currentTweetIndex=' + result.currentTweetIndex + " | threadLength=" + result.threadLength);
          result.threadChain.forEach((t, i) => {
            const preview = (t.text || "").substring(0, 50) + (t.text && t.text.length > 50 ? "..." : "");
            console.log("[TweetReplyAI] DIAG final chain[" + i + "]: author=@" + (t.author || "unknown") + " isOriginal=" + t.isOriginal + " isCurrent=" + t.isCurrent + ' text="' + preview + '"');
          });
        }
        if (DEBUG_THREAD_CONTEXT) {
          console.log("[TweetReplyAI] \u2705 Thread context extracted:", {
            isReply: result.isReply,
            originalTweetLength: result.originalTweet?.length || 0,
            threadLength: result.threadLength,
            currentIndex: result.currentTweetIndex
          });
          if (result.isReply && result.originalTweet) {
            console.log("[TweetReplyAI] \u{1F4CB} ORIGINAL TWEET & THREAD CHAIN:");
            console.log("[TweetReplyAI] \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510");
            console.log("[TweetReplyAI] \u2502 ORIGINAL TWEET:", result.originalTweetAuthor ? `@${result.originalTweetAuthor}` : "unknown author");
            console.log("[TweetReplyAI] \u2502", result.originalTweet);
            console.log("[TweetReplyAI] \u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524");
            console.log("[TweetReplyAI] \u2502 FULL THREAD CHAIN (" + result.threadLength + " tweets):");
            result.threadChain.forEach((tweet, idx) => {
              const marker = tweet.isOriginal ? "\u{1F535} ORIGINAL" : tweet.isCurrent ? "\u{1F7E2} CURRENT (replying to)" : `\u26AA Reply ${idx}`;
              const author = tweet.author !== "unknown" ? `@${tweet.author}` : "unknown";
              console.log("[TweetReplyAI] \u2502 [" + marker + "] " + author + ":");
              console.log('[TweetReplyAI] \u2502   "' + tweet.text.substring(0, 100) + (tweet.text.length > 100 ? "..." : "") + '"');
            });
            console.log("[TweetReplyAI] \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518");
          }
        }
        return result;
      } catch (error2) {
        console.error("[TweetReplyAI] \u274C Failed to extract thread context:", error2);
        const currentTweetText = this.extractTweetText();
        return {
          isReply: false,
          originalTweet: null,
          originalTweetAuthor: null,
          threadChain: currentTweetText ? [{
            text: currentTweetText,
            author: this.extractAuthorInfo()?.username || "unknown",
            isOriginal: true,
            isCurrent: true
          }] : [],
          currentTweetIndex: 0,
          threadLength: currentTweetText ? 1 : 0
        };
      }
    }
    /**
     * Detect if we're in a reply context by looking for reply indicators
     */
    detectReplyContext() {
      try {
        const composerContainer = document.querySelector('[data-testid^="tweetTextarea_"]')?.closest('div[role="dialog"], div[data-testid="cellInnerDiv"]') || document;
        const replyIndicators = composerContainer.querySelectorAll('span[dir="ltr"], span[dir="auto"]');
        for (const span of replyIndicators) {
          const text = span.textContent?.trim() || "";
          if (/^replying to @/i.test(text)) {
            return true;
          }
        }
        const composers = document.querySelectorAll('[data-testid^="tweetTextarea_"], [contenteditable="true"]');
        for (const composer of composers) {
          let parent = composer.parentElement;
          for (let i = 0; i < 10 && parent; i++) {
            if (parent.querySelector('[data-testid="reply"], [aria-label*="reply" i]')) {
              return true;
            }
            if (parent.textContent && /replying to/i.test(parent.textContent)) {
              return true;
            }
            parent = parent.parentElement;
          }
        }
        const threadContainer = this.findThreadContainer();
        if (threadContainer) {
          const tweets = threadContainer.querySelectorAll('article[data-testid="tweet"]');
          return tweets.length > 1;
        }
        return false;
      } catch (error2) {
        console.warn("[TweetReplyAI] Error detecting reply context:", error2);
        return false;
      }
    }
    /**
     * Find the thread container that holds multiple tweets
     */
    findThreadContainer() {
      try {
        const allTweets = document.querySelectorAll('article[data-testid="tweet"]');
        if (allTweets.length < 2) {
          return null;
        }
        let commonAncestor = allTweets[0].parentElement;
        for (let i = 0; i < 10 && commonAncestor; i++) {
          const tweetsInContainer = commonAncestor.querySelectorAll('article[data-testid="tweet"]');
          if (tweetsInContainer.length >= 2) {
            return commonAncestor;
          }
          commonAncestor = commonAncestor.parentElement;
        }
        const threadSelectors = [
          'div[data-testid="cellInnerDiv"]',
          'section[role="region"]',
          'div[role="article"]'
        ];
        for (const selector of threadSelectors) {
          const containers = document.querySelectorAll(selector);
          for (const container of containers) {
            const tweets = container.querySelectorAll('article[data-testid="tweet"]');
            if (tweets.length >= 2) {
              return container;
            }
          }
        }
        const threadIndicators = document.querySelectorAll("span, div");
        for (const indicator of threadIndicators) {
          const text = indicator.textContent?.trim() || "";
          if (/show.*thread|view.*thread/i.test(text)) {
            let container = indicator.parentElement;
            for (let i = 0; i < 5 && container; i++) {
              const tweets = container.querySelectorAll('article[data-testid="tweet"]');
              if (tweets.length >= 2) {
                return container;
              }
              container = container.parentElement;
            }
          }
        }
        return null;
      } catch (error2) {
        console.warn("[TweetReplyAI] Error finding thread container:", error2);
        return null;
      }
    }
    /**
     * Extract all tweets from a thread container
     */
    extractTweetsFromContainer(container) {
      try {
        const tweets = container.querySelectorAll('article[data-testid="tweet"]');
        const extractedTweets = [];
        for (const tweet of tweets) {
          const tweetTextEl = tweet.querySelector('[data-testid="tweetText"]');
          if (!tweetTextEl) continue;
          const text = extractTweetPlainText(tweetTextEl);
          if (!text || text.length < 10) continue;
          let author = "unknown";
          const userNameEl = tweet.querySelector('[data-testid="User-Name"]');
          if (userNameEl) {
            const fullText = userNameEl.textContent?.trim() || "";
            const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
            if (handleMatch) {
              author = handleMatch[1];
            }
          }
          if (author === "unknown" && userNameEl) {
            const profileLink = userNameEl.querySelector("a[href]");
            if (profileLink) {
              const href = profileLink.getAttribute("href") || "";
              const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
              if (hrefMatch) {
                author = hrefMatch[1];
              }
            }
          }
          if (author === "unknown") {
            const links = tweet.querySelectorAll("a[href]");
            const reservedPaths = /* @__PURE__ */ new Set(["status", "search", "intent", "i", "home", "hashtag", "compose", "settings", "explore", "notifications", "messages"]);
            for (const link of links) {
              const href = link.getAttribute("href") || "";
              const hrefMatch = href.match(/^\/([A-Za-z0-9_]+)$/);
              if (hrefMatch && !reservedPaths.has(hrefMatch[1].toLowerCase())) {
                author = hrefMatch[1];
                break;
              }
            }
          }
          extractedTweets.push({ text, author, statusId: this.getOwnStatusIdFromArticle(tweet) });
        }
        return extractedTweets;
      } catch (error2) {
        console.warn("[TweetReplyAI] Error extracting tweets from container:", error2);
        return [];
      }
    }
    /**
     * Find the index of the current tweet in the thread chain
     * @param {Array} threadTweets - Array of tweet objects with text property
     * @param {string} currentTweetText - The text of the tweet being replied to
     * @returns {number} Index of current tweet, or -1 if not found (caller should handle fallback)
     * 
     * FIX: Returns -1 when not found instead of defaulting to last tweet.
     * This allows caller to implement appropriate fallback logic based on context.
     */
    findCurrentTweetIndex(threadTweets, currentTweetText) {
      if (!currentTweetText || !threadTweets || threadTweets.length === 0) return -1;
      for (let i = 0; i < threadTweets.length; i++) {
        if (threadTweets[i].text === currentTweetText) {
          return i;
        }
      }
      const currentPrefix = currentTweetText.substring(0, 50).toLowerCase();
      for (let i = 0; i < threadTweets.length; i++) {
        const tweetPrefix = threadTweets[i].text.substring(0, 50).toLowerCase();
        if (tweetPrefix === currentPrefix) {
          return i;
        }
      }
      return -1;
    }
    extractTweetMetadata() {
      try {
        const hasMedia = !!document.querySelector('[data-testid="tweetPhoto"], [data-testid="videoPlayer"]');
        const hasPoll = !!document.querySelector('[data-testid="poll"]');
        const timeElement = document.querySelector("time");
        const timestamp = timeElement ? timeElement.getAttribute("datetime") : null;
        return {
          has_media: hasMedia,
          has_poll: hasPoll,
          timestamp
        };
      } catch (error2) {
        console.error("Failed to extract tweet metadata:", error2);
        return null;
      }
    }
    // Enhanced text insertion method based on inject.js proven approach
    // Handles multiple Twitter input types with comprehensive fallbacks
    async insertReplyIntoComposer(composer, replyData) {
      try {
        console.log("[TweetReplyAI] \u{1F680} Starting Twitter text insertion method");
        if (!composer || !replyData) {
          console.log("[TweetReplyAI] \u274C Invalid parameters");
          return;
        }
        const replyText = typeof replyData === "string" ? replyData : replyData.reply;
        const qualityScore = typeof replyData === "object" ? replyData.qualityScore : null;
        if (!replyText) {
          return;
        }
        const cleanText = this.stripReplyPrefix(replyText.replace(/<[^>]*>/g, ""));
        if (composer.contentEditable === "true" || composer.getAttribute("data-testid")?.startsWith("tweetTextarea_") || composer.getAttribute("role") === "textbox") {
          try {
            const toolbar = composer.closest('[data-testid="toolBar"]') || composer;
            await this.insertTextTwitterMethod(composer, toolbar, cleanText);
            return;
          } catch (error2) {
            console.warn("[TweetReplyAI] Twitter method failed:", error2);
          }
        }
        if (composer.classList && composer.classList.contains("ql-editor")) {
          try {
            composer.innerHTML = "";
            cleanText.split("\n").forEach((line) => {
              if (line.trim()) {
                const p = document.createElement("p");
                p.textContent = line;
                composer.appendChild(p);
              } else {
                const p = document.createElement("p");
                p.innerHTML = "<br>";
                composer.appendChild(p);
              }
            });
            if (composer.childNodes.length === 0) {
              const p = document.createElement("p");
              p.innerHTML = "<br>";
              composer.appendChild(p);
            }
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            return;
          } catch (error2) {
            console.warn("[TweetReplyAI] Quill editor method failed:", error2);
          }
        }
        if (composer.getAttribute("data-testid") === "dmComposerTextInput" || composer.classList.contains("public-DraftEditor-content") || composer.classList.contains("DraftEditor-editorContainer")) {
          try {
            document.execCommand("insertText", false, cleanText);
            return;
          } catch (error2) {
            console.warn("[TweetReplyAI] execCommand failed:", error2);
          }
          try {
            const contentDiv = composer.querySelector('[data-contents="true"]');
            if (contentDiv) {
              const blocks = contentDiv.querySelectorAll('[data-block="true"]');
              if (blocks.length > 0) {
                const textBlock = blocks[0].querySelector(".public-DraftStyleDefault-block");
                if (textBlock) {
                  textBlock.textContent = cleanText;
                  composer.dispatchEvent(new InputEvent("input", {
                    bubbles: true,
                    cancelable: true
                  }));
                  return;
                }
              }
            }
          } catch (error2) {
            console.warn("[TweetReplyAI] Draft.js DOM manipulation failed:", error2);
          }
          try {
            composer.dispatchEvent(new InputEvent("beforeinput", {
              inputType: "insertText",
              data: cleanText,
              bubbles: true,
              cancelable: true
            }));
            composer.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              cancelable: true
            }));
            return;
          } catch (error2) {
            console.warn("[TweetReplyAI] Draft.js input events failed:", error2);
          }
        }
        if (composer.tagName === "TEXTAREA") {
          composer.value = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
        if (composer.contentEditable === "true") {
          const dataTextSpan = composer.querySelector('[data-text="true"]');
          const targetElement = dataTextSpan ? dataTextSpan.parentElement : composer;
          composer.click();
          await this.sleep(20);
          const span = document.createElement("span");
          span.dataset.text = "true";
          span.textContent = cleanText;
          if (typeof targetElement.replaceChildren === "function") {
            targetElement.replaceChildren(span);
          } else {
            while (targetElement.firstChild) {
              targetElement.removeChild(targetElement.firstChild);
            }
            targetElement.appendChild(span);
          }
          targetElement.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true
          }));
          return;
        }
        const nestedInput = composer.querySelector('textarea, [contenteditable="true"]');
        if (nestedInput) {
          await this.insertReplyIntoComposer(nestedInput, replyData);
          return;
        }
        if (composer.value !== void 0) {
          composer.value = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (composer.textContent !== void 0) {
          composer.textContent = cleanText;
          composer.dispatchEvent(new Event("input", { bubbles: true }));
        }
        composer.focus();
        if (typeof qualityScore === "number") {
          this.showQualityBadge(composer, qualityScore);
        }
      } catch (error2) {
        console.error("[TweetReplyAI] \u274C Error during text insertion:", error2);
      }
    }
    showQualityBadge(composer, score) {
      try {
        const numericScore = typeof score === "number" ? score : Number(score);
        if (Number.isNaN(numericScore)) {
          return;
        }
        if (!composer || !composer.parentElement) {
          console.warn("[TweetReplyAI] Cannot show quality badge: composer or parent not found");
          return;
        }
        const existingBadge = composer.parentElement.querySelector(".tweetreply-quality-badge");
        if (existingBadge) {
          existingBadge.remove();
        }
        const badge = document.createElement("div");
        badge.className = "tweetreply-quality-badge";
        const label = document.createElement("span");
        label.className = "quality-label";
        label.textContent = "Quality:";
        const scoreEl = document.createElement("span");
        scoreEl.className = `quality-score quality-${this.getQualityClass(numericScore)}`;
        scoreEl.textContent = String(numericScore);
        badge.appendChild(label);
        badge.appendChild(scoreEl);
        const parent = composer.parentElement;
        if (parent) {
          parent.insertBefore(badge, composer.nextSibling);
        }
      } catch (error2) {
        console.error("[TweetReplyAI] Error showing quality badge:", error2);
      }
    }
    getQualityClass(score) {
      if (score >= 80) return "high";
      if (score >= 60) return "medium";
      return "low";
    }
    updateAllButtonStates() {
      document.querySelectorAll(".tweetreply-suggest-btn, .tweetreply-improve-btn").forEach((button) => {
        this.updateButtonState(button);
      });
    }
    showMessage(composer, message, type = "info") {
      const existingMessage = composer.parentElement?.querySelector(".tweetreply-message");
      if (existingMessage) {
        existingMessage.remove();
      }
      const messageEl = document.createElement("div");
      messageEl.className = `tweetreply-message tweetreply-message--${type}`;
      messageEl.textContent = message;
      const parent = composer.parentElement;
      if (parent) {
        parent.insertBefore(messageEl, composer.nextSibling);
      }
      setTimeout(() => {
        if (!messageEl.isConnected) return;
        let removed = false;
        const finalize = () => {
          if (removed) return;
          removed = true;
          messageEl.remove();
        };
        messageEl.addEventListener("animationend", finalize, { once: true });
        messageEl.classList.add("tweetreply-message--leaving");
        setTimeout(finalize, 400);
      }, 3e3);
    }
    formatTimeDistance(date) {
      const now = /* @__PURE__ */ new Date();
      const diffMs = date.getTime() - now.getTime();
      if (diffMs <= 0) return "soon";
      const hours = Math.floor(diffMs / (1e3 * 60 * 60));
      const minutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
      if (hours > 0) {
        return `in ${hours}h`;
      } else {
        return `in ${minutes}m`;
      }
    }
    // ============================================================================
    // CLEANUP & DESTRUCTION
    // ============================================================================
    destroy() {
      if (this._reuseModal) {
        try {
          this._reuseModal.close();
        } catch {
        }
        this._reuseModal = null;
      }
      this.injectedReuseButtons = /* @__PURE__ */ new WeakSet();
      if (this.mainObserver) {
        this.mainObserver.disconnect();
        this.mainObserver = null;
      }
      if (this.countUpdateTimeout) {
        clearTimeout(this.countUpdateTimeout);
        this.countUpdateTimeout = null;
      }
      if (this.autoLikeClickHandler) {
        document.removeEventListener("click", this.autoLikeClickHandler, true);
        this.autoLikeClickHandler = null;
      }
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
        this.usageDataInterval = null;
      }
      if (this.trackingCleanupInterval) {
        clearInterval(this.trackingCleanupInterval);
        this.trackingCleanupInterval = null;
      }
      if (this.urlTrackingInterval) {
        clearInterval(this.urlTrackingInterval);
        this.urlTrackingInterval = null;
      }
      if (this.mainObserverDebounceTimer) {
        clearTimeout(this.mainObserverDebounceTimer);
        this.mainObserverDebounceTimer = null;
      }
      if (this.followStatusMessageHandler) {
        window.removeEventListener("message", this.followStatusMessageHandler);
        this.followStatusMessageHandler = null;
      }
      if (this.followBadgeRefreshTimer) {
        clearTimeout(this.followBadgeRefreshTimer);
        this.followBadgeRefreshTimer = null;
      }
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      if (this.storageChangeHandler) {
        chrome.storage.onChanged.removeListener(this.storageChangeHandler);
        this.storageChangeHandler = null;
      }
      this.countDisplayInitialized = false;
      delete window.__tweetReplyInjector;
    }
  };
  if (!window.__tweetReplyInjector) {
    new TwitterReplyInjector();
  }
})();
