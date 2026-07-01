/**
 * Lazy import helper for heavy screens and components.
 *
 * React Native's Metro bundler produces a single bundle by default. Using
 * React.lazy() + Suspense defers parsing and execution of expensive modules
 * (AI buddy, analytics, admin dashboard, map components) until the user
 * actually navigates to them — improving cold-start and TTI.
 *
 * Usage:
 *   const AdminDashboard = lazyScreen(() => import('../screens/AdminDashboard'));
 *
 *   function App() {
 *     return (
 *       <Suspense fallback={<NexrydeLoadingScreen />}>
 *         <AdminDashboard />
 *       </Suspense>
 *     );
 *   }
 *
 * NOTE: Expo Router handles most screen splitting automatically via file-based
 * routing. Use this helper for components rendered inside screens that are
 * themselves heavy (e.g. a chart library, ML model, large icon set).
 */

import React, { ComponentType, lazy } from 'react';

type ComponentModule<T> = { default: ComponentType<T> };

/**
 * Lazily import a screen component.
 * Wraps React.lazy to provide proper TypeScript generics.
 */
export function lazyScreen<T extends Record<string, unknown>>(
  importFn: () => Promise<ComponentModule<T>>,
): React.LazyExoticComponent<ComponentType<T>> {
  return lazy(importFn);
}

/**
 * Lazily import a named export from a module.
 * Useful for e.g. `lazyNamed(() => import('./charts'), 'BarChart')`
 */
export function lazyNamed<T extends Record<string, unknown>>(
  importFn: () => Promise<Record<string, ComponentType<T>>>,
  exportName: string,
): React.LazyExoticComponent<ComponentType<T>> {
  return lazy(() =>
    importFn().then((m) => ({ default: m[exportName] as ComponentType<T> })),
  );
}
