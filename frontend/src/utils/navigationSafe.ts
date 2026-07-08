/**
 * Prevents duplicate router.replace() storms during auth hydration and trip phase changes.
 */
import type { Router } from 'expo-router';

const COOLDOWN_MS = 450;
const lastNav = { key: '', at: 0 };

function navKey(href: string | { pathname: string; params?: Record<string, unknown> }): string {
  if (typeof href === 'string') return href;
  const params = href.params ? JSON.stringify(href.params) : '';
  return `${href.pathname}?${params}`;
}

export function hrefToSegmentNeedles(href: string): string[] {
  return href
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/^\(|\)$/g, ''));
}

export function routeMatchesSegments(segments: readonly string[], href: string): boolean {
  const needles = hrefToSegmentNeedles(href);
  if (needles.length === 0) return false;
  const normalized = segments.map((s) => s.replace(/^\(|\)$/g, ''));
  return needles.every((n) => normalized.includes(n));
}

/** Replace only if not a duplicate within COOLDOWN_MS. Returns true if navigation ran. */
export function safeReplace(
  router: Pick<Router, 'replace'>,
  href: string | { pathname: string; params?: Record<string, unknown> },
): boolean {
  const key = navKey(href);
  const now = Date.now();
  if (lastNav.key === key && now - lastNav.at < COOLDOWN_MS) return false;
  lastNav.key = key;
  lastNav.at = now;
  router.replace(href as never);
  return true;
}
