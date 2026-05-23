import { resolveFeed } from '@/lib/sample-feed';

import { VerticalFeed } from './vertical-feed';

export const metadata = {
  title: 'DinoVerse Feed',
};

export default function FeedPage() {
  const clips = resolveFeed();
  return <VerticalFeed clips={clips} />;
}
