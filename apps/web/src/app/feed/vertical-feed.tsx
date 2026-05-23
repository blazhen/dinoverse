'use client';

import { useEffect, useRef, useState } from 'react';

import { type FeedClip, hostLabel } from '@/lib/sample-feed';

function Clip({ clip, muted }: { clip: FeedClip; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Autoplay only the clip that's mostly on screen; pause the rest.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative flex h-[100dvh] snap-start items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={clip.src}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      {/* Child-safe overlay: title + fun fact + host. No links, no comments. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-12 text-white">
        <p className="text-sm font-semibold text-emerald-300">{hostLabel(clip.host)}</p>
        <h2 className="mt-1 text-2xl font-black drop-shadow">{clip.title}</h2>
        <p className="mt-1 text-sm text-white/80">💡 {clip.fact}</p>
      </div>
    </section>
  );
}

export function VerticalFeed({ clips }: { clips: FeedClip[] }) {
  const [muted, setMuted] = useState(true);

  return (
    <div className="relative">
      <div className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
        {clips.map((clip) => (
          <Clip key={clip.id} clip={clip} muted={muted} />
        ))}
      </div>

      {/* Sound toggle (autoplay starts muted per browser policy). */}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? 'Unmute' : 'Mute'}
        className="fixed right-4 top-4 z-10 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur"
      >
        {muted ? '🔇 Sound off' : '🔊 Sound on'}
      </button>
    </div>
  );
}
