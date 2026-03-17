/**
 * Shared HTML parsing utilities for scene and interaction data.
 * Used by validate.ts, visual_verify.ts, and tests/eval_check.ts.
 */

export interface ParsedScene {
  starts: number[];
  ends: number[];
  labels: string[];
}

export interface ParsedInteraction {
  id: string;
  time: number;
  cat: string;
}

/**
 * Parse scene timing data from generated lesson HTML.
 * Returns null if scenes array cannot be found.
 */
export function parseScenes(html: string): ParsedScene | null {
  const match = html.match(/const scenes\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return null;

  const text = match[1];
  return {
    starts: [...text.matchAll(/s:\s*([\d.]+)/g)].map(m => parseFloat(m[1])),
    ends: [...text.matchAll(/e:\s*([\d.]+)/g)].map(m => parseFloat(m[1])),
    labels: [...text.matchAll(/label:\s*['"]([^'"]+)['"]/g)].map(m => m[1]),
  };
}

/**
 * Parse interaction data from generated lesson HTML.
 * Returns empty array if IX array cannot be found.
 */
export function parseInteractions(html: string): ParsedInteraction[] {
  const match = html.match(/const IX\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];

  const text = match[1];
  const ids = [...text.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const times = [...text.matchAll(/time:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const cats = [...text.matchAll(/cat:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

  const result: ParsedInteraction[] = [];
  for (let i = 0; i < ids.length; i++) {
    result.push({ id: ids[i], time: times[i] ?? 0, cat: cats[i] ?? 'q' });
  }
  return result;
}
