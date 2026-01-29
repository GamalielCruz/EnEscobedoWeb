"use client";

import { useEffect } from 'react';

export default function HydrationErrorSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Store original console methods
      const originalError = console.error;
      const originalWarn = console.warn;

      // Patterns for React/webpack stack traces and hydration errors
      const suppressPatterns = [
        'Hydration failed',
        'There was an error while hydrating',
        'Text content does not match server-rendered HTML',
        'Warning: Text content did not match',
        'Warning: Expected server HTML to contain',
        'Warning: Prop',
        'did not match',
        'emitPendingHydrationWarnings',
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

      // Function to check if message should be suppressed
      const shouldSuppress = (args: any[]) => {
        const message = args.join(' ');
        return suppressPatterns.some(pattern => 
          message.includes(pattern)
        );
      };

      // Override console methods
      console.error = (...args: any[]) => {
        if (!shouldSuppress(args)) {
          originalError.apply(console, args);
        }
      };

      console.warn = (...args: any[]) => {
        if (!shouldSuppress(args)) {
          originalWarn.apply(console, args);
        }
      };

      // Cleanup function to restore original console methods
      return () => {
        console.error = originalError;
        console.warn = originalWarn;
      };
    }
  }, []);

  return null; // This component doesn't render anything
}