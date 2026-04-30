/**
 * Archivist sub-Agent types.
 * Each sub-Agent owns one responsibility domain and its associated files.
 */

export type ArchivistResponsibility =
  | 'characters'
  | 'scene'
  | 'world'
  | 'plot'
  | 'timeline'
  | 'debts';

export const RESPONSIBILITIES: readonly ArchivistResponsibility[] = [
  'characters',
  'scene',
  'world',
  'plot',
  'timeline',
  'debts',
] as const;
