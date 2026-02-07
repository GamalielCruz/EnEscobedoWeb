"use client";

declare global {
  // eslint-disable-next-line no-var
  var __HYDRATION_CONSOLE_SUPPRESSOR_INSTALLED__: boolean | undefined;
}

// Patterns for React/webpack stack traces and hydration errors
const suppressPatterns = [
  'Hydration failed',
  'There was an error while hydrating',
  'hydration',
  'Text content does not match server-rendered HTML',
  'Text content did not match',
  'Warning: Text content did not match',
  'Warning: Expected server HTML to contain',
  'Expected server HTML',
  'server-rendered HTML',
  'server HTML',
  'Warning: Prop',
  'did not match',
  'does not match',
  'emitPendingHydrationWarnings',
  'installHydrationConsoleSuppressor',
  'createConsoleError',
  'handleConsoleError',
  'intercept-console-error',
  'react-dom-client.development.js',
  'next-devtools',
  'runWithFiberInDEV',
  'completeWork',
  'performUnitOfWork',
  'workLoopSync',
  'renderRootSync',
  'react-server-dom-webpack',
  'beginWork',
  'workLoopConcurrentByScheduler',
  'renderRootConcurrent',
  'performWorkOnRoot',
  'performWorkOnRootViaSchedulerTask',
  'performWorkUntilDeadline',
  'react_stack_bottom_frame',
  'initializeModuleChunk',
  'readChunk',
  'requireModule',
  'options.factory@',
  '__webpack_require__@',
  'webpack.js',
  'scheduler.development.js',
  'webpack-internal',
  'chunks/webpack.js',
  'static/chunks/webpack.js',
];

function normalizeConsoleArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function shouldSuppress(args: unknown[]) {
  const message = args.map(normalizeConsoleArg).join(' ');
  if (suppressPatterns.some((pattern) => message.includes(pattern))) return true;
  // Detectar por call stack: si la llamada viene de emitPendingHydrationWarnings
  try {
    const stack = new Error().stack ?? '';
    if (stack.includes('emitPendingHydrationWarnings')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function installHydrationConsoleSuppressor() {
  // Important: install at module-eval time so it runs BEFORE hydration warnings.
  if (process.env.NODE_ENV !== 'development') return;
  if (globalThis.__HYDRATION_CONSOLE_SUPPRESSOR_INSTALLED__) return;
  globalThis.__HYDRATION_CONSOLE_SUPPRESSOR_INSTALLED__ = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalError(...(args as any[]));
  };

  console.warn = (...args: unknown[]) => {
    if (!shouldSuppress(args)) originalWarn(...(args as any[]));
  };
}

installHydrationConsoleSuppressor();

export default function HydrationErrorSuppressor() {
  return null; // This component doesn't render anything
}