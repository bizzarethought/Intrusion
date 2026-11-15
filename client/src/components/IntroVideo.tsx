import { useEffect, useRef } from 'react';
import { playGlitch } from '../audio';
import { serverNow } from '../protocol/roomClient';

export const INTRO_VIDEO = '/assets/loading/loading_screen_reference.mp4';

/**
 * The loading screen: the team's rendered video with the glitch effect. The server
 * decides when it runs. Every client shows the moment of the video that matches the
 * server's clock, timed to end as the loading phase ends, so a slow connection joins
 * part-way through instead of running behind everyone else.
 */
export function IntroVideo({ endsAt, onFail }: { endsAt: number; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const glitch = playGlitch();
    const sync = () => {
      // The loading phase is as long as the video (10 s), so "time left" is "video left".
      const at = Math.max(0, (element.duration || 10) - (endsAt - serverNow()) / 1000);
      if (Math.abs(element.currentTime - at) > 0.3) element.currentTime = at;
      if (glitch && Math.abs(glitch.currentTime - at) > 0.3) glitch.currentTime = at;
    };
    // The video has no soundtrack of its own, so it can always start muted (browsers allow that).
    element.play().catch(onFail);
    element.addEventListener('loadedmetadata', sync);
    const timer = setInterval(sync, 500);
    sync();
    return () => { clearInterval(timer); element.removeEventListener('loadedmetadata', sync); glitch?.pause(); };
  }, [endsAt, onFail]);
  return (
    <div className="intro ui">
      <video ref={video} src={INTRO_VIDEO} muted playsInline onError={onFail} />
    </div>
  );
}
