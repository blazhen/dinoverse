import type { AgeBand } from '@dinoverse/db';

/** Human labels for each age band. */
export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  '5-6': 'Ages 5–6',
  '7-8': 'Ages 7–8',
  '9-10': 'Ages 9–10',
  '11-12': 'Ages 11–12',
  '13-14': 'Ages 13–14',
};

/** Memory Match: number of pairs scales up with age. */
export const memoryPairsForBand: Record<AgeBand, number> = {
  '5-6': 4,
  '7-8': 6,
  '9-10': 8,
  '11-12': 10,
  '13-14': 12,
};

/** Used when no child is selected (game is still playable, just not personalized). */
export const DEFAULT_AGE_BAND: AgeBand = '7-8';
