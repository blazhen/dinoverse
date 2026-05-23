import type { CharacterId } from '@dinoverse/db';

/**
 * A single clip in the vertical content feed.
 * `src` is a direct video URL. In dev we use free public sample videos; later this
 * will be swapped for Cloudflare Stream playback URLs (see resolveFeed()).
 */
export interface FeedClip {
  id: string;
  title: string;
  fact: string;
  host: CharacterId;
  src: string;
}

const SAMPLE_BASE = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample';

/** Dev feed backed by public sample videos — no Cloudflare Stream cost. */
export const sampleFeed: FeedClip[] = [
  {
    id: 'clip-volcanoes',
    title: 'Why did dino-cities build on volcanoes?',
    fact: 'Geothermal heat powers Dino City — for free!',
    host: 'brachiosaurus',
    src: `${SAMPLE_BASE}/BigBuckBunny.mp4`,
  },
  {
    id: 'clip-stars',
    title: "Stego's guide to the night sky",
    fact: 'Dinosaurs watched the same stars 65 million years ago.',
    host: 'stego',
    src: `${SAMPLE_BASE}/ElephantsDream.mp4`,
  },
  {
    id: 'clip-speed',
    title: 'Trik races a velocirobot!',
    fact: 'Some dinos could run faster than a city bus.',
    host: 'trik',
    src: `${SAMPLE_BASE}/ForBiggerBlazes.mp4`,
  },
  {
    id: 'clip-fossils',
    title: 'How fossils become museum stars',
    fact: 'A fossil can take over 10,000 years to form.',
    host: 'brachiosaurus',
    src: `${SAMPLE_BASE}/ForBiggerEscapes.mp4`,
  },
];

const HOST_LABEL: Record<CharacterId, string> = {
  trik: '⚡ Trik',
  stego: '🛡️ Stego',
  brachiosaurus: '🔭 Brachiosaurus',
};

export function hostLabel(host: CharacterId): string {
  return HOST_LABEL[host];
}

/**
 * Returns the feed for now (sample videos). When Cloudflare Stream is wired,
 * this becomes the single place that maps streamUid -> signed playback URL.
 */
export function resolveFeed(): FeedClip[] {
  return sampleFeed;
}
