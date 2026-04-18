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
  function uuid4(crypto = getCrypto()) {
    try {
      if (crypto?.randomUUID) {
        return withRandomSafeContext(() => crypto.randomUUID()).replace(/-/g, "");
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
    async suggestImprovements(draftReply, originalTweet) {
      return this.makeRequest("/api/suggest-improvements", {
        method: "POST",
        body: {
          draft_reply: draftReply,
          original_tweet: originalTweet
        }
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
      prompt_variation,
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
          prompt_variation,
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

  // extension/popup/popup.js
  initExtensionSentry({ scope: "popup" });
  var SETTINGS_TAB_IDS = ["account", "x", "cta", "billing", "tracking"];
  var SETTINGS_ACTIVE_TAB_KEY = "settingsActiveTab";
  var SNIPPET_FORM_AUTOSAVE_MS = 550;
  var TRACKING_DAYS_AUTOSAVE_MS = 350;
  globalThis.__tweetreplyaiExtLoggingAllowed = false;
  installConsoleGate(() => globalThis.__tweetreplyaiExtLoggingAllowed === true);
  var PopupManager = class {
    constructor() {
      this.authManager = new AuthManager();
      this.apiClient = new ApiClient();
      this.currentState = "loading";
      this.usageData = null;
      this.qualityMetrics = null;
      this.usageDataInterval = null;
      this.qualityMetricsInterval = null;
      this.analyticsRefreshInterval = null;
      this.focusHandler = null;
      this.visibilityHandler = null;
      this.beforeunloadHandler = null;
      this.initializeElements();
      this.checkoutInProgress = false;
      this.attachEventListeners();
      this.setupAuthListener();
      this.setupDataRefresh();
      this.initialize();
    }
    setupAuthListener() {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "authUpdated") {
          this.initialize();
        }
      });
    }
    setupDataRefresh() {
      this.startUsageDataRefresh();
      this.startQualityMetricsRefresh();
      this.setupFocusRefresh();
      this.setupUsageUpdateListener();
      this.setupCleanup();
    }
    startUsageDataRefresh() {
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
      }
      this.usageDataInterval = setInterval(async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error2) {
            console.error("Failed to refresh usage data:", error2);
          }
        }
      }, POLLING.USAGE_REFRESH_MS);
    }
    startQualityMetricsRefresh() {
      if (this.qualityMetricsInterval) {
        clearInterval(this.qualityMetricsInterval);
      }
      this.qualityMetricsInterval = setInterval(async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadQualityMetrics();
          } catch (error2) {
            console.error("Failed to refresh quality metrics:", error2);
          }
        }
      }, POLLING.ANALYTICS_REFRESH_MS);
    }
    setupFocusRefresh() {
      this.focusHandler = async () => {
        if (this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error2) {
            console.error("Failed to refresh data on focus:", error2);
          }
        }
      };
      this.visibilityHandler = async () => {
        if (!document.hidden && this.currentState === "authenticated") {
          try {
            await this.loadUsageData();
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          } catch (error2) {
            console.error("Failed to refresh data on visibility change:", error2);
          }
        }
      };
      window.addEventListener("focus", this.focusHandler);
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    setupUsageUpdateListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "usageUpdated" || message.action === "replyGenerated") {
          this.loadUsageData().then(() => {
            this.updateUsageDisplay();
            this.updateQuickStats();
            this.loadQualityMetrics().catch((err) => console.error("Quality metrics refresh failed:", err));
          }).catch((error2) => {
            console.error("Failed to refresh usage after reply generation:", error2);
          });
        }
        return true;
      });
    }
    setupCleanup() {
      this.beforeunloadHandler = () => {
        this.cleanup();
      };
      window.addEventListener("beforeunload", this.beforeunloadHandler);
    }
    cleanup() {
      if (this.usageDataInterval) {
        clearInterval(this.usageDataInterval);
        this.usageDataInterval = null;
      }
      if (this.qualityMetricsInterval) {
        clearInterval(this.qualityMetricsInterval);
        this.qualityMetricsInterval = null;
      }
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
        this.analyticsRefreshInterval = null;
      }
      if (this.focusHandler) {
        window.removeEventListener("focus", this.focusHandler);
        this.focusHandler = null;
      }
      if (this.visibilityHandler) {
        document.removeEventListener("visibilitychange", this.visibilityHandler);
        this.visibilityHandler = null;
      }
      if (this.beforeunloadHandler) {
        window.removeEventListener("beforeunload", this.beforeunloadHandler);
        this.beforeunloadHandler = null;
      }
    }
    initializeElements() {
      this.loadingState = document.getElementById("loading");
      this.notAuthenticatedState = document.getElementById("not-authenticated");
      this.authenticatedState = document.getElementById("authenticated");
      this.quotaExceededState = document.getElementById("quota-exceeded");
      this.signinBtn = document.getElementById("signin-btn");
      this.historyBtn = document.getElementById("history-btn");
      this.analyticsBtn = document.getElementById("analytics-btn");
      this.webAppBtn = document.getElementById("web-app-btn");
      this.billingBtn = document.getElementById("billing-btn");
      this.upgradeBtn = document.getElementById("upgrade-btn");
      this.logoutBtn = document.getElementById("logout-btn");
      this.settingsBtn = document.getElementById("settings-btn");
      this.signoutBtn = document.getElementById("signout-btn");
      this.closeSettingsBtn = document.getElementById("close-settings");
      this.upgradeCta = document.getElementById("upgrade-cta");
      this.closeHistoryBtn = document.getElementById("close-history");
      this.statusDot = document.getElementById("status-dot");
      this.statusText = document.getElementById("status-text");
      this.progressFill = document.getElementById("progress-fill");
      this.usageText = document.getElementById("usage-text");
      this.resetText = document.getElementById("reset-text");
      this.quotaResetText = document.getElementById("quota-reset-text");
      this.statusMessage = document.getElementById("status-message");
      this.quotaBanner = document.getElementById("quota-banner");
      this.quotaBannerUsed = document.getElementById("quota-banner-used");
      this.quotaBannerLimit = document.getElementById("quota-banner-limit");
      this.quotaBannerBtn = document.getElementById("quota-banner-btn");
      this.userName = document.getElementById("user-name");
      this.planBadge = document.getElementById("plan-badge");
      this.usagePercentage = document.getElementById("usage-percentage");
      this.todayReplies = document.getElementById("today-replies");
      this.successRate = document.getElementById("success-rate");
      this.timeSaved = document.getElementById("time-saved");
      this.settingsPanel = document.getElementById("settings-panel");
      this.userEmail = document.getElementById("user-email");
      this.historyPanel = document.getElementById("history-panel");
      this.analyticsPanel = document.getElementById("analytics-panel");
      this.analyticsBackBtn = document.getElementById("analytics-back-btn");
      this.analyticsLoading = document.getElementById("analytics-loading");
      this.analyticsError = document.getElementById("analytics-error");
      this.analyticsRetryBtn = document.getElementById("analytics-retry-btn");
      this.analyticsData = document.getElementById("analytics-data");
      this.analyticsSummary = document.getElementById("analytics-summary");
      this.activityTrend = document.getElementById("activity-trend");
      this.insightsPanel = document.getElementById("insights-panel");
    }
    attachEventListeners() {
      this.signinBtn?.addEventListener("click", () => this.handleSignIn());
      this.historyBtn?.addEventListener("click", () => this.showHistory());
      this.analyticsBtn?.addEventListener("click", () => this.showAnalytics());
      this.webAppBtn?.addEventListener("click", () => this.handleOpenWebApp());
      this.billingBtn?.addEventListener("click", () => this.handleManageBilling());
      this.upgradeBtn?.addEventListener("click", () => this.handleUpgrade());
      this.upgradeCta?.addEventListener("click", () => this.handleUpgrade());
      this.quotaBannerBtn?.addEventListener("click", () => this.handleUpgrade());
      this.logoutBtn?.addEventListener("click", () => this.handleSignOut());
      this.settingsBtn?.addEventListener("click", () => this.showSettings());
      this.signoutBtn?.addEventListener("click", () => this.handleSignOut());
      this.closeSettingsBtn?.addEventListener("click", () => this.hideSettings());
      this.closeHistoryBtn?.addEventListener("click", () => this.hideHistory());
      this.analyticsBackBtn?.addEventListener("click", () => this.hideAnalytics());
      this.analyticsRetryBtn?.addEventListener("click", () => this.loadAnalytics());
      const snippetLabelInput = document.getElementById("snippetLabelInput");
      const snippetTextInput = document.getElementById("snippetTextInput");
      snippetLabelInput?.addEventListener("input", () => this.scheduleSnippetFormAutoSave());
      snippetTextInput?.addEventListener("input", () => this.scheduleSnippetFormAutoSave());
      const defaultSnippetSelect = document.getElementById("defaultSnippetSelect");
      const autoAppendSnippetSelect = document.getElementById("autoAppendSnippetSelect");
      defaultSnippetSelect?.addEventListener("change", () => this.saveSnippetPreferences());
      autoAppendSnippetSelect?.addEventListener("change", () => this.saveSnippetPreferences());
      const trackingPeriodInput = document.getElementById("trackingPeriodDays");
      trackingPeriodInput?.addEventListener("input", () => this.scheduleTrackingDaysAutoSave());
      trackingPeriodInput?.addEventListener("change", () => {
        if (this._trackingDaysSaveTimer) {
          clearTimeout(this._trackingDaysSaveTimer);
          this._trackingDaysSaveTimer = null;
        }
        this.saveTrackingSettings();
      });
      const relationshipHintsEl = document.getElementById("relationshipHintsEnabled");
      if (relationshipHintsEl) {
        relationshipHintsEl.addEventListener("change", () => this.saveRelationshipHintsSetting());
      }
      const followBadgeIconStyleEl = document.getElementById("followBadgeIconStyle");
      if (followBadgeIconStyleEl) {
        followBadgeIconStyleEl.addEventListener("change", () => this.saveFollowBadgeIconStyleSetting());
      }
      this.setupKeyboardNavigation();
      this.initSettingsTabs();
      this.initializeDarkMode();
    }
    setupKeyboardNavigation() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (!this.settingsPanel?.classList.contains("hidden")) {
            this.hideSettings();
          } else if (!this.historyPanel?.classList.contains("hidden")) {
            this.hideHistory();
          } else if (!this.analyticsPanel?.classList.contains("hidden")) {
            this.hideAnalytics();
          }
        }
      });
    }
    initializeDarkMode() {
      chrome.storage.local.get(["theme"], (result) => {
        if (result.theme) {
          document.documentElement.setAttribute("data-theme", result.theme);
        } else {
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (prefersDark) {
            document.documentElement.setAttribute("data-theme", "dark");
          }
        }
      });
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        chrome.storage.local.get(["theme"], (result) => {
          if (!result.theme) {
            document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
          }
        });
      });
    }
    async initialize() {
      try {
        this.setState("loading");
        this.authManager.setApiClient(this.apiClient);
        let isAuthenticated = await this.authManager.isAuthenticated(true);
        if (!isAuthenticated) {
          await this.tryAuthSync();
          isAuthenticated = await this.authManager.isAuthenticated(true);
        }
        if (!isAuthenticated) {
          this.setState("not-authenticated");
          return;
        }
        await this.loadUserData();
        await this.loadUsageData();
        this.loadQualityMetrics().catch((err) => console.error("Quality metrics load failed:", err));
        if (this.usageData) {
          if (this.usageData.status === "no_access") {
            this.setState("authenticated");
          } else if (this.usageData.status === "trial" || this.usageData.status === "active") {
            if (this.usageData.used >= this.usageData.limit || this.usageData.upgradeRequired) {
              this.setState("authenticated");
            } else {
              this.setState("authenticated");
            }
          } else {
            this.setState("authenticated");
          }
        } else {
          this.setState("authenticated");
        }
        this.updateUsageDisplay();
        this.updateQuickStats();
      } catch (error2) {
        console.error("Failed to initialize popup:", error2);
        this.reportTelemetry("unknown_runtime_error", error2, "popup_initialize");
        this.setState("not-authenticated");
      }
    }
    async tryAuthSync() {
      try {
        const tabs = await chrome.tabs.query({ url: "https://tweetreplyai.vercel.app/*" });
        if (tabs.length > 0) {
          chrome.runtime.sendMessage({
            action: "syncAuthFromTab",
            tabId: tabs[0].id
          });
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      } catch (error2) {
        console.error("Failed to sync auth:", error2);
        this.reportTelemetry("auth_sync_failed", error2, "popup_auth_sync");
      }
    }
    async loadUserData() {
      try {
        const user = await this.apiClient.getCurrentUser();
        if (user) {
          if (this.userEmail) {
            this.userEmail.textContent = user.email || "Unknown";
          }
          this.updateWelcomeMessage(user);
        }
      } catch (error2) {
        console.error("Failed to load user data:", error2);
        this.reportTelemetry("api_request_failed", error2, "/api/auth/user");
      }
    }
    async loadUsageData() {
      try {
        this.usageData = await this.apiClient.getUsage();
      } catch (error2) {
        console.error("Failed to load usage data:", error2);
        this.reportTelemetry("api_request_failed", error2, "/api/usage");
        const userFacing = this.getUserFacingError(error2, "Something went wrong. Try again.");
        this.showStatusMessage(userFacing.message, "error");
        this.usageData = null;
      }
    }
    async loadQualityMetrics() {
      const startTime = Date.now();
      console.log("[LOG][Quality] loadQualityMetrics() invoked at", new Date(startTime).toISOString());
      try {
        console.log("[LOG][Quality] -> requesting /api/quality/metrics?days=30");
        const response = await this.apiClient.getQualityMetrics(DEFAULTS.ANALYTICS_DAYS);
        console.log("[LOG][Quality] <- response received in", Date.now() - startTime, "ms:", response);
        this.processQualityMetricsResponse(response);
        this.updateQuickStats();
        return response;
      } catch (error2) {
        console.error("[ERROR][Quality] loadQualityMetrics failed:", error2);
        console.error("[ERROR][Quality] stack:", error2?.stack);
        this.reportTelemetry("api_request_failed", error2, "/api/quality/metrics");
        this.processQualityMetricsResponse(null);
        return null;
      }
    }
    processQualityMetricsResponse(response) {
      this.qualityMetricsResponse = response;
      if (!response) {
        console.warn("[WARN][Quality] No quality metrics response available");
        this.qualityMetrics = null;
        this.qualityRecommendations = [];
        return;
      }
      const { metrics = null, recommendations = [] } = response;
      console.log("[LOG][Quality] Raw response payload:", response);
      if (metrics) {
        console.log("[LOG][Quality] Extracted metrics:", {
          avg: metrics.avg_quality_score,
          high: metrics.high_quality_replies,
          low: metrics.low_quality_replies,
          regen: metrics.regeneration_rate
        });
      } else {
        console.warn("[WARN][Quality] Metrics object missing in response");
      }
      console.log(
        "[LOG][Quality] Recommendations count:",
        Array.isArray(recommendations) ? recommendations.length : 0,
        "Sample:",
        Array.isArray(recommendations) ? recommendations.slice(0, 3) : recommendations
      );
      this.qualityMetrics = metrics;
      this.qualityRecommendations = Array.isArray(recommendations) ? recommendations : [];
      console.log("[DEBUG][Quality] Normalized metrics stored:", this.qualityMetrics);
      console.log("[DEBUG][Quality] Normalized recommendations stored:", this.qualityRecommendations);
    }
    setState(state) {
      this.loadingState?.classList.add("hidden");
      this.notAuthenticatedState?.classList.add("hidden");
      this.authenticatedState?.classList.add("hidden");
      this.quotaExceededState?.classList.add("hidden");
      this.settingsPanel?.classList.add("hidden");
      this.historyPanel?.classList.add("hidden");
      this.improvePanel?.classList.add("hidden");
      this.analyticsPanel?.classList.add("hidden");
      if (this.settingsPanel) this.settingsPanel.style.display = "none";
      if (this.historyPanel) this.historyPanel.style.display = "none";
      if (this.improvePanel) this.improvePanel.style.display = "none";
      if (this.analyticsPanel) this.analyticsPanel.style.display = "none";
      this.currentState = state;
      switch (state) {
        case "loading":
          this.loadingState?.classList.remove("hidden");
          this.logoutBtn?.classList.add("hidden");
          break;
        case "not-authenticated":
          this.notAuthenticatedState?.classList.remove("hidden");
          this.logoutBtn?.classList.add("hidden");
          break;
        case "authenticated":
          this.authenticatedState?.classList.remove("hidden");
          this.logoutBtn?.classList.remove("hidden");
          break;
        case "quota-exceeded":
          this.quotaExceededState?.classList.remove("hidden");
          this.logoutBtn?.classList.remove("hidden");
          break;
      }
    }
    updateUsageDisplay() {
      if (!this.usageData) return;
      const { used, limit, resetAt, status, planCode, upgradeRequired, subscriptionCanceled } = this.usageData;
      const subCanceled = !!subscriptionCanceled;
      const percentage = Math.min(used / limit * 100, 100);
      const isExceeded = used >= limit || !!upgradeRequired;
      if (this.progressFill) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressFill.classList.toggle("exceeded", isExceeded);
      }
      const progressBar = document.querySelector('.usage-progress-bar[role="progressbar"]');
      if (progressBar) {
        progressBar.setAttribute("aria-valuenow", Math.round(percentage));
        progressBar.setAttribute("aria-valuetext", `${used} of ${limit} credits used`);
      }
      if (this.usageText) {
        this.usageText.textContent = `${used} / ${limit} credits`;
      }
      if (this.usagePercentage) {
        this.usagePercentage.textContent = `${Math.round(percentage)}%`;
      }
      if (this.statusDot && this.statusText) {
        this.statusDot.classList.toggle("active", !isExceeded);
        this.statusText.textContent = isExceeded ? "Limit reached" : "Active";
      }
      const resetDistance = this.formatTimeDistance(new Date(resetAt));
      const isTrial = planCode === "trial" || status === "trial";
      const timeVerb = subCanceled ? "Ends" : "Resets";
      const resetLine = !isExceeded ? `${timeVerb} ${resetDistance}` : isTrial ? "You've used all your trial credits: upgrade to continue." : `You've used all your credits. ${timeVerb} ${resetDistance}`;
      if (this.resetText) {
        this.resetText.textContent = resetLine;
      }
      if (this.quotaResetText) {
        this.quotaResetText.textContent = resetLine;
      }
      if (this.statusMessage) {
        if (isExceeded) {
          this.statusMessage.textContent = isTrial ? "You've used all your trial credits: upgrade to continue." : `You've used all your credits. ${timeVerb} ${resetDistance}`;
        } else {
          this.statusMessage.textContent = 'Click "Reply" on any X post to generate suggestions';
        }
      }
      if (this.quotaBanner) {
        if (isExceeded) {
          if (this.quotaBannerUsed) this.quotaBannerUsed.textContent = used;
          if (this.quotaBannerLimit) this.quotaBannerLimit.textContent = limit;
          this.quotaBanner.classList.remove("hidden");
        } else {
          this.quotaBanner.classList.add("hidden");
        }
      }
      this.updateModeBreakdown();
      this.updateQuickStats();
      this.updatePlanBadge();
    }
    // formatModeBreakdown() removed - no longer used after collapsible breakdown implementation
    updateModeBreakdown() {
      try {
        const toggle = document.getElementById("breakdown-toggle");
        const btn = document.getElementById("breakdown-btn");
        const content = document.getElementById("breakdown-content");
        const chevron = document.getElementById("breakdown-chevron");
        if (!toggle || !btn || !content || !chevron) return;
        if (!btn.dataset.initialized) {
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-controls", "breakdown-content");
          btn.addEventListener("click", () => {
            const isExpanded = content.style.display !== "none";
            const newState = !isExpanded;
            content.style.display = newState ? "block" : "none";
            chevron.classList.toggle("expanded", newState);
            btn.setAttribute("aria-expanded", String(newState));
          });
          btn.dataset.initialized = "true";
        }
        if (this.usageData) {
          const breakdown = this.usageData.modeBreakdown || {};
          const totalCredits = this.usageData.used || 0;
          const modes = [
            { key: "single-sentence", label: "Concise" },
            { key: "enhanced", label: "Enhanced" },
            { key: "improve", label: "Improve" },
            { key: "reframe", label: "Reused Tweets" }
          ];
          let totalReplies = 0;
          let hasAllReplyCounts = true;
          let rows = "";
          for (const mode of modes) {
            const data = breakdown[mode.key] || { credits: 0 };
            const credits = Number(data.credits) || 0;
            const replies = Number(data.replies);
            const derivedReplies = Number.isFinite(replies) ? Math.max(0, Math.floor(replies)) : null;
            if (derivedReplies === null) {
              hasAllReplyCounts = false;
            } else {
              totalReplies += derivedReplies;
            }
            rows += `
            <div class="breakdown-row">
              <span class="breakdown-label">${mode.label}:</span>
              <span class="breakdown-value">${derivedReplies ?? 0} replies, ${credits} credits</span>
            </div>
          `;
          }
          content.innerHTML = `
          ${rows}
          <div class="breakdown-total">
            Total: ${hasAllReplyCounts ? totalReplies : 0} replies, ${totalCredits} credits
          </div>
        `;
          toggle.style.display = "block";
        } else {
          toggle.style.display = "none";
        }
      } catch (error2) {
        console.error("[Popup] Failed to update breakdown:", error2);
        const toggle = document.getElementById("breakdown-toggle");
        if (toggle) {
          toggle.style.display = "none";
        }
      }
    }
    formatTimeDistance(date) {
      const now = /* @__PURE__ */ new Date();
      const diffMs = date.getTime() - now.getTime();
      if (diffMs <= 0) return "soon";
      const days = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
      const hours = Math.floor(diffMs % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
      const minutes = Math.floor(diffMs % (1e3 * 60 * 60) / (1e3 * 60));
      const parts = [];
      if (days > 0) {
        parts.push(`${days}d`);
      }
      if (hours > 0) {
        parts.push(`${hours}h`);
      }
      if (minutes > 0 || parts.length === 0) {
        parts.push(`${minutes}m`);
      }
      return `in ${parts.join(" ")}`;
    }
    async handleSignIn() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const loginUrl = `${protocol}://${domain}/login`;
        chrome.tabs.create({ url: loginUrl });
        window.close();
      } catch (error2) {
        console.error("Failed to handle sign in:", error2);
      }
    }
    // NOTE: handleSuggestReply() method removed - Generate Reply button was removed from UI
    // Reply generation is now handled directly in content script via Twitter UI buttons
    async handleOpenWebApp() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const webAppUrl = `${protocol}://${domain}/app`;
        chrome.tabs.create({ url: webAppUrl });
        window.close();
      } catch (error2) {
        console.error("Failed to open web app:", error2);
      }
    }
    async handleManageBilling() {
      try {
        const portalUrl = await this.apiClient.createBillingPortal();
        chrome.tabs.create({ url: portalUrl });
        window.close();
      } catch (error2) {
        console.error("Failed to open billing portal:", error2);
        this.reportTelemetry("api_request_failed", error2, "/api/billing/portal");
        this.showStatusMessage(this.getUserFacingError(error2, "Something went wrong. Try again.").message, "error");
      }
    }
    async handleUpgrade() {
      try {
        const domains = await this.getDomains();
        const domain = domains[0] || "tweetreplyai.vercel.app";
        const protocol = domain.includes("localhost") ? "http" : "https";
        const pricingUrl = `${protocol}://${domain}/pricing`;
        chrome.tabs.create({ url: pricingUrl });
        window.close();
      } catch (error2) {
        console.error("Failed to open pricing:", error2);
      }
    }
    async handleSignOut() {
      try {
        try {
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          await fetch(`${protocol}://${domain}/api/auth/logout`, {
            method: "POST",
            credentials: "include"
          });
        } catch (error2) {
          console.error("Failed to logout from web app:", error2);
        }
        await this.authManager.signOut();
        this.setState("not-authenticated");
        this.hideSettings();
      } catch (error2) {
        console.error("Failed to sign out:", error2);
      }
    }
    initSettingsTabs() {
      if (this._settingsTabsInitialized) return;
      const tabs = this.settingsPanel?.querySelectorAll('[role="tab"][data-settings-tab]');
      tabs?.forEach((tab) => {
        tab.addEventListener("click", () => this.setSettingsTab(tab.dataset.settingsTab));
      });
      this._settingsTabsInitialized = true;
    }
    getFirstFocusableIn(container) {
      if (!container) return null;
      const sel = 'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
      return container.querySelector(sel);
    }
    scheduleSnippetFormAutoSave() {
      if (this._snippetFormSaveTimer) {
        clearTimeout(this._snippetFormSaveTimer);
      }
      this._snippetFormSaveTimer = setTimeout(() => {
        this._snippetFormSaveTimer = null;
        this.tryAutoSaveSnippetForm();
      }, SNIPPET_FORM_AUTOSAVE_MS);
    }
    scheduleTrackingDaysAutoSave() {
      if (this._trackingDaysSaveTimer) {
        clearTimeout(this._trackingDaysSaveTimer);
      }
      this._trackingDaysSaveTimer = setTimeout(() => {
        this._trackingDaysSaveTimer = null;
        this.saveTrackingSettings();
      }, TRACKING_DAYS_AUTOSAVE_MS);
    }
    async tryAutoSaveSnippetForm() {
      const labelEl = document.getElementById("snippetLabelInput");
      const textEl = document.getElementById("snippetTextInput");
      const label = (labelEl?.value || "").trim();
      const text = (textEl?.value || "").trim();
      if (!label || !text) return;
      try {
        const r = await chrome.storage.local.get([SNIPPET_STORAGE.LIBRARY]);
        const library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
        if (library.length >= DEFAULTS.SNIPPET_LIBRARY_LIMIT) {
          this.showStatusMessage(`Max ${DEFAULTS.SNIPPET_LIBRARY_LIMIT} snippets allowed.`, "error");
          return;
        }
        if (library.some((s) => String(s.label).toLowerCase() === label.toLowerCase())) {
          this.showStatusMessage("Snippet label must be unique.", "error");
          return;
        }
        library.push({
          id: `snippet_${Date.now()}`,
          label: label.slice(0, 60),
          text: text.slice(0, DEFAULTS.SNIPPET_MAX_LENGTH),
          updatedAt: Date.now()
        });
        await chrome.storage.local.set({ [SNIPPET_STORAGE.LIBRARY]: library, [SNIPPET_STORAGE.MIGRATED]: true });
        if (labelEl) labelEl.value = "";
        if (textEl) textEl.value = "";
        const savedMsg = document.getElementById("cta-settings-saved");
        if (savedMsg) {
          savedMsg.textContent = "CTA added.";
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
        await this.loadSnippetSettings();
      } catch (error2) {
        this.reportTelemetry("storage_write_failed", error2, "save_snippet");
        this.showStatusMessage("Something went wrong. Try again.", "error");
      }
    }
    setSettingsTab(key) {
      const normalized = key === "snippets" ? "cta" : key;
      const k = SETTINGS_TAB_IDS.includes(normalized) ? normalized : "account";
      SETTINGS_TAB_IDS.forEach((id) => {
        const tab = document.getElementById(`settings-tab-${id}`);
        const panel = document.getElementById(`settings-panel-${id}`);
        const selected = id === k;
        if (tab) {
          tab.setAttribute("aria-selected", selected ? "true" : "false");
          tab.tabIndex = selected ? 0 : -1;
        }
        if (panel) {
          if (selected) {
            panel.removeAttribute("hidden");
            panel.setAttribute("aria-hidden", "false");
          } else {
            panel.setAttribute("hidden", "");
            panel.setAttribute("aria-hidden", "true");
          }
        }
      });
      chrome.storage.local.set({ [SETTINGS_ACTIVE_TAB_KEY]: k }).catch(() => {
      });
    }
    async showSettings() {
      this.settingsPanel?.classList.remove("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "";
        this.settingsPanel.setAttribute("aria-hidden", "false");
        this.settingsBtn?.setAttribute("aria-expanded", "true");
        this.loadTrackingSettings();
        this.loadRelationshipHintsSettings();
        this.loadSnippetSettings();
        this.loadPlansSection();
        let tab = "account";
        try {
          const r = await chrome.storage.local.get(SETTINGS_ACTIVE_TAB_KEY);
          let stored = r[SETTINGS_ACTIVE_TAB_KEY];
          if (stored === "snippets") stored = "cta";
          if (SETTINGS_TAB_IDS.includes(stored)) tab = stored;
        } catch {
        }
        this.setSettingsTab(tab);
        requestAnimationFrame(() => {
          const panel = document.getElementById(`settings-panel-${tab}`);
          this.getFirstFocusableIn(panel)?.focus();
        });
      }
    }
    hideSettings() {
      if (this._snippetFormSaveTimer) {
        clearTimeout(this._snippetFormSaveTimer);
        this._snippetFormSaveTimer = null;
      }
      if (this._trackingDaysSaveTimer) {
        clearTimeout(this._trackingDaysSaveTimer);
        this._trackingDaysSaveTimer = null;
      }
      this.settingsPanel?.classList.add("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "none";
        this.settingsPanel.setAttribute("aria-hidden", "true");
        this.settingsBtn?.setAttribute("aria-expanded", "false");
      }
      this.settingsBtn?.focus();
    }
    async loadRelationshipHintsSettings() {
      try {
        const r = await chrome.storage.sync.get([
          STORAGE.RELATIONSHIP_HINTS_ENABLED,
          STORAGE.FOLLOW_BADGE_ICON_STYLE
        ]);
        const el = document.getElementById("relationshipHintsEnabled");
        if (el) el.checked = r[STORAGE.RELATIONSHIP_HINTS_ENABLED] !== false;
        const sel = document.getElementById("followBadgeIconStyle");
        if (sel) {
          const raw = r[STORAGE.FOLLOW_BADGE_ICON_STYLE];
          const v = typeof raw === "string" && FOLLOW_BADGE_ICON_STYLE_VALUES.includes(raw) ? raw : FOLLOW_BADGE_ICON_STYLE_DEFAULT;
          sel.value = v;
        }
      } catch (error2) {
        console.error("Failed to load relationship hints setting:", error2);
      }
    }
    async saveFollowBadgeIconStyleSetting() {
      try {
        const sel = document.getElementById("followBadgeIconStyle");
        if (!sel) return;
        const v = FOLLOW_BADGE_ICON_STYLE_VALUES.includes(sel.value) ? sel.value : FOLLOW_BADGE_ICON_STYLE_DEFAULT;
        if (sel.value !== v) sel.value = v;
        await chrome.storage.sync.set({ [STORAGE.FOLLOW_BADGE_ICON_STYLE]: v });
      } catch (error2) {
        console.error("Failed to save follow badge icon style:", error2);
      }
    }
    async saveRelationshipHintsSetting() {
      try {
        const el = document.getElementById("relationshipHintsEnabled");
        if (!el) return;
        await chrome.storage.sync.set({ [STORAGE.RELATIONSHIP_HINTS_ENABLED]: el.checked });
      } catch (error2) {
        console.error("Failed to save relationship hints setting:", error2);
      }
    }
    // Load reply tracking settings
    async loadTrackingSettings() {
      try {
        const result = await chrome.storage.local.get(["replyTrackingSettings"]);
        const settings = result.replyTrackingSettings || {
          trackingPeriodDays: 7
        };
        const trackingPeriodInput = document.getElementById("trackingPeriodDays");
        if (trackingPeriodInput) {
          trackingPeriodInput.value = settings.trackingPeriodDays || 7;
        }
      } catch (error2) {
        console.error("Failed to load tracking settings:", error2);
      }
    }
    reportTelemetry(eventType, error2, route = "", context = {}) {
      emitTelemetry({
        event_type: eventType,
        surface: "popup",
        route,
        error_code: error2?.message || eventType,
        context
      });
    }
    // Snippet library + legacy CTA migration
    async loadSnippetSettings() {
      try {
        const r = await chrome.storage.local.get([
          SNIPPET_STORAGE.LIBRARY,
          SNIPPET_STORAGE.DEFAULT_ID,
          SNIPPET_STORAGE.AUTO_APPEND_ID,
          SNIPPET_STORAGE.MIGRATED,
          CTA_STORAGE.TEXT,
          CTA_STORAGE.AUTO_APPEND
        ]);
        let library = Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : [];
        let defaultId = r[SNIPPET_STORAGE.DEFAULT_ID] || "";
        let autoAppendId = r[SNIPPET_STORAGE.AUTO_APPEND_ID] || "";
        if (!r[SNIPPET_STORAGE.MIGRATED] && !library.length && typeof r[CTA_STORAGE.TEXT] === "string" && r[CTA_STORAGE.TEXT].trim()) {
          const migratedId = `snippet_${Date.now()}`;
          library = [{ id: migratedId, label: "My CTA", text: r[CTA_STORAGE.TEXT].trim(), updatedAt: Date.now() }];
          defaultId = migratedId;
          autoAppendId = r[CTA_STORAGE.AUTO_APPEND] ? migratedId : "";
          await chrome.storage.local.set({
            [SNIPPET_STORAGE.LIBRARY]: library,
            [SNIPPET_STORAGE.DEFAULT_ID]: defaultId,
            [SNIPPET_STORAGE.AUTO_APPEND_ID]: autoAppendId,
            [SNIPPET_STORAGE.MIGRATED]: true
          });
        }
        this.renderSnippetLibrary(library, defaultId, autoAppendId);
      } catch (error2) {
        this.reportTelemetry("storage_read_failed", error2, "snippet_settings");
        console.error("Failed to load snippet settings:", error2);
      }
    }
    renderSnippetLibrary(library, defaultId, autoAppendId) {
      const list = document.getElementById("snippetLibraryList");
      const defaultSel = document.getElementById("defaultSnippetSelect");
      const autoSel = document.getElementById("autoAppendSnippetSelect");
      if (list) {
        list.innerHTML = "";
        if (!library.length) {
          const hint = document.createElement("p");
          hint.className = "snippet-empty-hint";
          hint.textContent = "No CTAs yet. Add a label and text below.";
          list.appendChild(hint);
        }
        library.forEach((snippet) => {
          const row = document.createElement("div");
          row.className = "snippet-item";
          row.innerHTML = `<div><strong>${this.escapeHtml(snippet.label)}</strong><div class="snippet-item-text">${this.escapeHtml(this.truncate(snippet.text, 90))}</div></div>`;
          const del = document.createElement("button");
          del.className = "snippet-delete-btn";
          del.textContent = "Delete";
          del.addEventListener("click", () => this.deleteSnippet(snippet.id));
          row.appendChild(del);
          list.appendChild(row);
        });
      }
      if (defaultSel && autoSel) {
        const makeOptions = (select, includeNone) => {
          select.innerHTML = includeNone ? '<option value="">None</option>' : "";
          library.forEach((s) => {
            const option = document.createElement("option");
            option.value = s.id;
            option.textContent = s.label;
            select.appendChild(option);
          });
        };
        makeOptions(defaultSel, true);
        makeOptions(autoSel, true);
        defaultSel.value = defaultId || "";
        autoSel.value = autoAppendId || "";
      }
    }
    async deleteSnippet(snippetId) {
      try {
        const r = await chrome.storage.local.get([
          SNIPPET_STORAGE.LIBRARY,
          SNIPPET_STORAGE.DEFAULT_ID,
          SNIPPET_STORAGE.AUTO_APPEND_ID
        ]);
        const inUse = r[SNIPPET_STORAGE.DEFAULT_ID] === snippetId || r[SNIPPET_STORAGE.AUTO_APPEND_ID] === snippetId;
        if (inUse) {
          const ok = confirm(
            "This snippet is set as your default or auto-append snippet. Delete it anyway?"
          );
          if (!ok) return;
        }
        const library = (Array.isArray(r[SNIPPET_STORAGE.LIBRARY]) ? r[SNIPPET_STORAGE.LIBRARY] : []).filter((s) => s.id !== snippetId);
        const updates = { [SNIPPET_STORAGE.LIBRARY]: library };
        if (r[SNIPPET_STORAGE.DEFAULT_ID] === snippetId) updates[SNIPPET_STORAGE.DEFAULT_ID] = "";
        if (r[SNIPPET_STORAGE.AUTO_APPEND_ID] === snippetId) updates[SNIPPET_STORAGE.AUTO_APPEND_ID] = "";
        await chrome.storage.local.set(updates);
        await this.loadSnippetSettings();
      } catch (error2) {
        this.reportTelemetry("storage_write_failed", error2, "delete_snippet");
      }
    }
    async saveSnippetPreferences() {
      try {
        const defaultSel = document.getElementById("defaultSnippetSelect");
        const autoSel = document.getElementById("autoAppendSnippetSelect");
        await chrome.storage.local.set({
          [SNIPPET_STORAGE.DEFAULT_ID]: defaultSel?.value || "",
          [SNIPPET_STORAGE.AUTO_APPEND_ID]: autoSel?.value || "",
          [SNIPPET_STORAGE.MIGRATED]: true
        });
        const savedMsg = document.getElementById("cta-settings-saved");
        if (savedMsg) {
          savedMsg.textContent = "Defaults saved.";
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
      } catch (error2) {
        this.reportTelemetry("storage_write_failed", error2, "save_snippet_preferences");
      }
    }
    async loadPlansSection() {
      const plansList = document.getElementById("plansList");
      if (!plansList) return;
      plansList.innerHTML = '<div class="snippet-item-text">Loading plans...</div>';
      try {
        const response = await this.apiClient.getPlans();
        const plans = Array.isArray(response?.plans) ? response.plans : Array.isArray(response) ? response : [];
        if (!plans.length) {
          plansList.innerHTML = "";
          const msg = document.createElement("div");
          msg.className = "snippet-item-text";
          msg.textContent = "Plans unavailable here.";
          plansList.appendChild(msg);
          const pricing = document.createElement("a");
          pricing.className = "settings-web-link";
          pricing.textContent = "View pricing on the web";
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          pricing.href = `${protocol}://${domain}/pricing`;
          pricing.target = "_blank";
          pricing.rel = "noopener noreferrer";
          plansList.appendChild(pricing);
          return;
        }
        plansList.innerHTML = "";
        const currentPlan = (this.usageData?.planCode || "trial").toString().toLowerCase();
        const planLabels = {
          trial: "Free Trial",
          weekly: "Weekly Plan",
          monthly: "Monthly Plan",
          bypass: "Pro Plan"
        };
        const currentBanner = document.createElement("div");
        currentBanner.className = "plan-current-banner";
        currentBanner.textContent = `Current plan: ${planLabels[currentPlan] || planLabels.trial}`;
        plansList.appendChild(currentBanner);
        plans.forEach((plan) => {
          const item = document.createElement("div");
          item.className = "plan-item";
          const label = document.createElement("span");
          const code = (plan.code || plan.planCode || "").toString().toLowerCase();
          const name = plan.name || plan.code || code;
          label.textContent = name;
          const btn = document.createElement("button");
          btn.className = "secondary-btn";
          btn.textContent = code === currentPlan ? "Current" : "Choose";
          btn.disabled = code === currentPlan;
          if (code !== currentPlan) {
            btn.addEventListener("click", () => this.startCheckout(plan.code || plan.planCode));
          }
          item.appendChild(label);
          item.appendChild(btn);
          plansList.appendChild(item);
        });
      } catch (error2) {
        this.reportTelemetry("api_request_failed", error2, "/api/plans");
        plansList.innerHTML = "";
        const err = document.createElement("div");
        err.className = "snippet-item-text";
        err.textContent = "Unable to load plans right now.";
        plansList.appendChild(err);
        const pricing = document.createElement("a");
        pricing.className = "settings-web-link";
        pricing.textContent = "View pricing on the web";
        pricing.target = "_blank";
        pricing.rel = "noopener noreferrer";
        try {
          const domains = await this.getDomains();
          const domain = domains[0] || "tweetreplyai.vercel.app";
          const protocol = domain.includes("localhost") ? "http" : "https";
          pricing.href = `${protocol}://${domain}/pricing`;
        } catch {
          pricing.href = "https://tweetreplyai.vercel.app/pricing";
        }
        plansList.appendChild(pricing);
      }
    }
    async startCheckout(planCode) {
      if (!planCode || this.checkoutInProgress) return;
      this.checkoutInProgress = true;
      try {
        const checkout = await this.apiClient.createCheckout(planCode);
        const checkoutUrl = checkout?.checkout_url || checkout?.url;
        if (!checkoutUrl) throw new Error("Missing checkout url");
        chrome.tabs.create({ url: checkoutUrl });
        this.showStatusMessage("Checkout started. Return after payment.", "success");
      } catch (error2) {
        this.reportTelemetry("api_request_failed", error2, "/api/checkout", { action: "create_checkout" });
        const userFacing = this.getUserFacingError(error2);
        this.showStatusMessage(userFacing.message, "error");
      } finally {
        this.checkoutInProgress = false;
      }
    }
    async saveTrackingSettings() {
      try {
        const trackingPeriodInput = document.getElementById("trackingPeriodDays");
        const savedMsg = document.getElementById("tracking-settings-saved");
        if (!trackingPeriodInput) return;
        const trackingPeriod = parseInt(trackingPeriodInput.value, 10) || 7;
        const clampedPeriod = Math.max(
          DEFAULTS.TRACKING_DAYS_MIN,
          Math.min(DEFAULTS.TRACKING_DAYS_MAX, trackingPeriod)
        );
        if (String(trackingPeriodInput.value) !== "" && clampedPeriod !== trackingPeriod) {
          trackingPeriodInput.value = String(clampedPeriod);
        }
        await chrome.storage.local.set({
          replyTrackingSettings: {
            trackingPeriodDays: clampedPeriod
          }
        });
        if (savedMsg) {
          savedMsg.style.display = "block";
          setTimeout(() => {
            savedMsg.style.display = "none";
          }, 1600);
        }
      } catch (error2) {
        console.error("Failed to save tracking settings:", error2);
        alert("Failed to save settings. Please try again.");
      }
    }
    showHistory() {
      this.hideAllPanels();
      this.historyPanel?.classList.remove("hidden");
      if (this.historyPanel) {
        this.historyPanel.style.display = "flex";
        this.historyPanel.setAttribute("aria-hidden", "false");
        this.closeHistoryBtn?.focus();
      }
      this.loadReplyHistory();
    }
    hideHistory() {
      this.historyPanel?.classList.add("hidden");
      if (this.historyPanel) {
        this.historyPanel.style.display = "none";
        this.historyPanel.setAttribute("aria-hidden", "true");
      }
      this.historyBtn?.focus();
    }
    showAnalytics() {
      this.hideAllPanels();
      this.analyticsPanel?.classList.remove("hidden");
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "flex";
        this.analyticsPanel.setAttribute("aria-hidden", "false");
        this.analyticsBackBtn?.focus();
      }
      this.loadAnalytics();
      this.startAnalyticsAutoRefresh();
    }
    hideAnalytics() {
      this.analyticsPanel?.classList.add("hidden");
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "none";
        this.analyticsPanel.setAttribute("aria-hidden", "true");
      }
      this.stopAnalyticsAutoRefresh();
      this.analyticsBtn?.focus();
    }
    startAnalyticsAutoRefresh() {
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
      }
      this.analyticsRefreshInterval = setInterval(async () => {
        if (this.analyticsPanel && !this.analyticsPanel.classList.contains("hidden")) {
          try {
            await this.loadAnalytics();
          } catch (error2) {
            console.error("Failed to auto-refresh analytics:", error2);
          }
        }
      }, 3e4);
    }
    stopAnalyticsAutoRefresh() {
      if (this.analyticsRefreshInterval) {
        clearInterval(this.analyticsRefreshInterval);
        this.analyticsRefreshInterval = null;
      }
    }
    hideAllPanels() {
      this.settingsPanel?.classList.add("hidden");
      this.historyPanel?.classList.add("hidden");
      this.analyticsPanel?.classList.add("hidden");
      if (this.settingsPanel) {
        this.settingsPanel.style.display = "none";
        this.settingsPanel.setAttribute("aria-hidden", "true");
      }
      if (this.historyPanel) {
        this.historyPanel.style.display = "none";
        this.historyPanel.setAttribute("aria-hidden", "true");
      }
      if (this.analyticsPanel) {
        this.analyticsPanel.style.display = "none";
        this.analyticsPanel.setAttribute("aria-hidden", "true");
      }
    }
    async loadReplyHistory() {
      try {
        const history = await this.apiClient.getReplyHistory(20);
        this.displayHistory(history.history);
      } catch (error2) {
        console.error("Failed to load history:", error2);
      }
    }
    displayHistory(entries) {
      const listElement = document.getElementById("history-list");
      if (!listElement) return;
      listElement.innerHTML = "";
      if (!entries || entries.length === 0) {
        listElement.innerHTML = '<div class="empty-state">No reply history found</div>';
        return;
      }
      entries.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "history-item";
        const header = document.createElement("div");
        header.className = "history-header";
        const dateEl = document.createElement("span");
        dateEl.className = "history-date";
        dateEl.textContent = new Date(entry.createdAt).toLocaleDateString();
        header.appendChild(dateEl);
        if (entry.qualityScore) {
          const qualityEl = document.createElement("span");
          qualityEl.className = "quality-badge";
          qualityEl.textContent = `Quality: ${entry.qualityScore}`;
          header.appendChild(qualityEl);
        }
        const tweetEl = document.createElement("div");
        tweetEl.className = "history-tweet";
        tweetEl.textContent = this.truncate(String(entry.originalTweet ?? ""), 80);
        const replyEl = document.createElement("div");
        replyEl.className = "history-reply";
        replyEl.textContent = String(entry.generatedReply ?? "");
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-btn";
        copyBtn.textContent = "Copy";
        copyBtn.addEventListener("click", () => {
          navigator.clipboard.writeText(String(entry.generatedReply ?? ""));
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1e3);
        });
        item.appendChild(header);
        item.appendChild(tweetEl);
        item.appendChild(replyEl);
        item.appendChild(copyBtn);
        listElement.appendChild(item);
      });
    }
    async loadAnalytics(forceRefresh = false) {
      console.log("[Analytics] ========== Loading analytics START ==========");
      console.log("[Analytics] DOM elements check:", {
        loading: !!this.analyticsLoading,
        error: !!this.analyticsError,
        data: !!this.analyticsData,
        summary: !!this.analyticsSummary,
        trend: !!this.activityTrend,
        insights: !!this.insightsPanel
      });
      if (this.analyticsLoading) {
        this.analyticsLoading.classList.remove("hidden");
        console.log("[Analytics] Showing loading state");
      }
      if (this.analyticsError) this.analyticsError.classList.add("hidden");
      if (this.analyticsData) this.analyticsData.classList.add("hidden");
      try {
        console.log("[Analytics] Calling API: /api/analytics/simple?days=30");
        const response = await this.apiClient.getSimpleAnalytics(DEFAULTS.ANALYTICS_DAYS);
        console.log("[Analytics] \u2713 API Response received:", JSON.stringify(response, null, 2));
        if (!response || !response.summary) {
          throw new Error("Invalid response structure: missing summary");
        }
        console.log("[Analytics] Response structure valid");
        if (this.analyticsLoading) this.analyticsLoading.classList.add("hidden");
        if (this.analyticsData) {
          this.analyticsData.classList.remove("hidden");
          console.log("[Analytics] Showing data container");
        }
        console.log("[Analytics] Rendering summary...");
        this.renderAnalyticsSummary(response.summary);
        console.log("[Analytics] Rendering activity trend...");
        this.renderActivityTrend(response.activityTrend);
        console.log("[Analytics] Rendering insights...");
        this.renderInsights(response.insights);
        console.log("[Analytics] ========== Loading analytics COMPLETE ==========");
      } catch (error2) {
        console.error("[Analytics] \u274C FAILED to load analytics");
        console.error("[Analytics] Error type:", error2.constructor.name);
        console.error("[Analytics] Error message:", error2.message);
        console.error("[Analytics] Error stack:", error2.stack);
        if (this.analyticsLoading) this.analyticsLoading.classList.add("hidden");
        if (this.analyticsError) {
          this.analyticsError.classList.remove("hidden");
          console.log("[Analytics] Showing error state");
        }
        if (this.analyticsData) this.analyticsData.classList.add("hidden");
      }
    }
    renderAnalyticsSummary(summary) {
      if (!this.analyticsSummary) return;
      const { avgQuality, qualityTrend, totalReplies, timeSavedHours, highQualityCount } = summary;
      const trendIndicator = qualityTrend > 0 ? `<span class="trend-indicator positive">+${qualityTrend} from last period</span>` : qualityTrend < 0 ? `<span class="trend-indicator negative">${qualityTrend} from last period</span>` : "";
      const timeDisplay = timeSavedHours >= 1 ? `${timeSavedHours}h` : `${Math.round(timeSavedHours * 60)}m`;
      this.analyticsSummary.innerHTML = `
      <h3>Summary</h3>
      <div class="analytics-summary-grid">
        <div class="analytics-summary-card">
          <div class="metric-value">${avgQuality}</div>
          <div class="metric-label">Avg Quality</div>
          ${trendIndicator}
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${totalReplies}</div>
          <div class="metric-label">Total Replies</div>
        </div>
        <div class="analytics-summary-card">
          <div class="metric-value">${timeDisplay}</div>
          <div class="metric-label">Time Saved</div>
        </div>
      </div>
    `;
    }
    renderActivityTrend(trend) {
      if (!this.activityTrend) return;
      if (trend.length === 0) {
        this.activityTrend.innerHTML = `
        <h3>Activity Trend</h3>
        <p class="empty-state">No activity data available yet</p>
      `;
        return;
      }
      const maxCount = Math.max(...trend.map((d) => d.count), 1);
      const width = 320;
      const height = 180;
      const leftPad = 28;
      const rightPad = 12;
      const topPad = 22;
      const bottomPad = 26;
      const chartWidth = width - leftPad - rightPad;
      const chartHeight = height - topPad - bottomPad;
      const chartBottom = height - bottomPad;
      const chartTop = topPad;
      const yTicks = (() => {
        const ticks = [0];
        if (maxCount <= 0) return ticks;
        const step = maxCount <= 5 ? 1 : maxCount <= 20 ? Math.ceil(maxCount / 4) : Math.ceil(maxCount / 4 / 10) * 10;
        for (let v = step; v < maxCount; v += step) ticks.push(v);
        if (maxCount > 0 && ticks[ticks.length - 1] !== maxCount) ticks.push(maxCount);
        return ticks;
      })();
      const getX = (i) => leftPad + (trend.length <= 1 ? 0 : i / (trend.length - 1) * chartWidth);
      const getY = (count) => chartBottom - count / maxCount * chartHeight;
      const points = trend.map((d, i) => `${getX(i)},${getY(d.count)}`).join(" ");
      const xLabels = trend.map((d, i) => {
        const x = getX(i);
        const dayLabel = (/* @__PURE__ */ new Date(d.date + "T12:00:00")).toLocaleDateString("en-US", { weekday: "short" });
        return `<text x="${x}" y="${chartBottom + 14}" text-anchor="middle" class="activity-chart-axis" font-size="10">${dayLabel}</text>`;
      }).join("");
      const yLabels = yTicks.map((val) => {
        const y = chartBottom - val / maxCount * chartHeight;
        return `<text x="${leftPad - 4}" y="${y + 4}" text-anchor="end" class="activity-chart-axis" font-size="10">${val}</text>`;
      }).join("");
      const countLabels = trend.map((d, i) => {
        const x = getX(i);
        const y = getY(d.count);
        return `<text x="${x}" y="${y - 6}" text-anchor="middle" class="activity-chart-count" font-size="11" font-weight="600">${d.count}</text>`;
      }).join("");
      this.activityTrend.innerHTML = `
      <h3>Activity Trend (Last 7 Days)</h3>
      <div class="activity-chart">
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="activityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#3B82F6;stop-opacity:0.5" />
              <stop offset="100%" style="stop-color:#3B82F6;stop-opacity:0" />
            </linearGradient>
          </defs>
          <!-- Y-axis grid -->
          ${yTicks.map((val) => {
        const y = chartBottom - val / maxCount * chartHeight;
        return `<line x1="${leftPad}" y1="${y}" x2="${width - rightPad}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
      }).join("")}
          <!-- X-axis grid -->
          ${trend.map((_, i) => {
        const x = getX(i);
        return `<line x1="${x}" y1="${chartTop}" x2="${x}" y2="${chartBottom}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>`;
      }).join("")}
          <!-- Axes -->
          <line x1="${leftPad}" y1="${chartTop}" x2="${leftPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <line x1="${leftPad}" y1="${chartBottom}" x2="${width - rightPad}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1"/>
          <!-- Y-axis labels -->
          ${yLabels}
          <!-- X-axis labels -->
          ${xLabels}
          <!-- Area fill -->
          <polygon points="${leftPad},${chartBottom} ${points} ${width - rightPad},${chartBottom}" fill="url(#activityGradient)" opacity="0.3"/>
          <!-- Line -->
          <polyline points="${points}" fill="none" stroke="#3B82F6" stroke-width="2"/>
          <!-- Count at each day -->
          ${countLabels}
          <!-- Points -->
          ${trend.map((d, i) => {
        const x = getX(i);
        const y = getY(d.count);
        return `<circle cx="${x}" cy="${y}" r="3" fill="#3B82F6"/>`;
      }).join("")}
        </svg>
      </div>
    `;
    }
    renderInsights(insights) {
      if (!this.insightsPanel) return;
      if (insights.length === 0) {
        this.insightsPanel.innerHTML = `
        <h3>Insights</h3>
        <p class="empty-state">Generate more replies to unlock insights!</p>
      `;
        return;
      }
      const iconMap = {
        success: "\u2713",
        info: "\u2139",
        streak: "\u{1F525}"
      };
      const allowedTypes = new Set(Object.keys(iconMap));
      const insightItems = insights.map((insight) => {
        const safeType = allowedTypes.has(insight.type) ? insight.type : "info";
        const icon = iconMap[safeType] || "\u2139";
        return `
        <div class="insight-item">
          <div class="insight-icon ${safeType}">${icon}</div>
          <div class="insight-text">${this.escapeHtml(insight.text)}</div>
        </div>
      `;
      }).join("");
      this.insightsPanel.innerHTML = `
      <h3>Insights</h3>
      <div class="insights-list">
        ${insightItems}
      </div>
    `;
    }
    truncate(text, maxLength) {
      if (!text) return "";
      return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    }
    escapeHtml(text) {
      if (!text) return "";
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    showStatusMessage(message, type = "info") {
      const existingMessage = document.querySelector(".temp-status");
      if (existingMessage) {
        existingMessage.remove();
      }
      const messageEl = document.createElement("div");
      messageEl.className = `temp-status ${type === "error" ? "error-message" : "success-message"}`;
      messageEl.textContent = message;
      const firstState = document.querySelector(".state:not(.hidden)");
      if (firstState) {
        firstState.insertBefore(messageEl, firstState.firstChild);
      }
      setTimeout(() => {
        messageEl?.remove();
      }, 3e3);
    }
    async getDomains() {
      try {
        const result = await chrome.storage.local.get(["apiDomain"]);
        if (result.apiDomain) {
          return [result.apiDomain];
        }
        return ["tweetreplyai.vercel.app"];
      } catch (error2) {
        console.error("Failed to get domains:", error2);
        return ["tweetreplyai.vercel.app"];
      }
    }
    // New methods for enhanced UI
    updateWelcomeMessage(user) {
      if (this.userName) {
        console.log("User object for welcome message:", user);
        let name = user.name || user.displayName || user.fullName || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName);
        if (!name && user.email) {
          const emailPrefix = user.email.split("@")[0];
          const cleanedName = emailPrefix.replace(/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g, "");
          if (cleanedName.length >= 2) {
            name = cleanedName;
          } else {
            name = emailPrefix;
          }
        }
        name = (name || "").trim().split(/\s+/)[0] || name || "there";
        if (!name) {
          name = "there";
        }
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        this.userName.textContent = capitalizedName;
      }
    }
    updatePlanBadge() {
      if (this.planBadge && this.usageData) {
        const planCode = (this.usageData.planCode || "trial").toString().toLowerCase();
        const planLabels = {
          "trial": "Free Trial",
          "weekly": "Weekly Plan",
          "monthly": "Monthly Plan",
          "bypass": "Pro Plan"
        };
        this.planBadge.textContent = planLabels[planCode] || "Free Plan";
        this.planBadge.className = "plan-badge" + (planCode === "bypass" ? " plan-badge--pro" : planCode === "weekly" || planCode === "monthly" ? " plan-badge--paid" : "");
        this.planBadge.style.background = "";
        this.planBadge.style.color = "";
        const isPaidPlan = planCode === "bypass" || planCode === "weekly" || planCode === "monthly";
        if (this.upgradeCta) {
          this.upgradeCta.style.display = isPaidPlan ? "none" : "";
        }
        const footerActions = this.upgradeCta?.closest(".footer-actions");
        if (footerActions) {
          footerActions.style.display = isPaidPlan ? "none" : "";
        }
      }
    }
    updateQuickStats() {
      const breakdown = this.usageData?.modeBreakdown || {};
      let hasAllReplyCounts = true;
      const totalReplies = ["single-sentence", "enhanced", "improve"].reduce((sum, key) => {
        const explicitReplies = Number(breakdown[key]?.replies);
        if (!Number.isFinite(explicitReplies)) {
          hasAllReplyCounts = false;
          return sum;
        }
        const replies = Math.max(0, Math.floor(explicitReplies));
        return sum + replies;
      }, 0);
      const todayRepliesValue = hasAllReplyCounts ? String(totalReplies) : "0";
      if (this.todayReplies) {
        this.todayReplies.textContent = todayRepliesValue;
        console.log("[LOG][QuickStats] Today replies updated to", todayRepliesValue);
      } else {
        console.warn("[WARN][QuickStats] todayReplies element missing");
      }
      if (this.successRate) {
        console.log("[LOG][QuickStats] updateQuickStats invoked with metrics:", this.qualityMetrics);
        console.log("[LOG][QuickStats] usageData derived replies:", todayRepliesValue);
        console.log("[LOG][QuickStats] successRate element exists?", !!this.successRate);
        if (this.qualityMetrics && this.qualityMetrics.avg_quality_score !== void 0 && this.qualityMetrics.avg_quality_score !== null) {
          const score = Math.round(this.qualityMetrics.avg_quality_score);
          console.log("[LOG][QuickStats] Displaying quality score:", score);
          this.successRate.textContent = score.toString();
        } else {
          console.warn("[WARN][QuickStats] No quality metrics available, falling back to --");
          this.successRate.textContent = "--";
        }
        console.log("[LOG][QuickStats] successRate text now:", this.successRate.textContent);
      }
      if (this.timeSaved) {
        this.timeSaved.textContent = "--";
      }
    }
    formatTimeSaved(minutes) {
      if (minutes < 60) {
        return `${minutes}m`;
      } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
      }
    }
    /**
     * Formats quality score as percentage.
     * Handles both decimal (0-1) and percentage (0-100) formats.
     * Returns '--' for null/undefined values.
     * @param {number|null|undefined} avgScore - The average quality score
     * @returns {string} Formatted score as percentage or '--'
     */
    formatQualityScore(avgScore) {
      if (avgScore === null || avgScore === void 0) {
        return "--";
      }
      return avgScore < 1 ? `${Math.round(avgScore * 100)}%` : `${Math.round(avgScore)}%`;
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    new PopupManager();
  });
})();
