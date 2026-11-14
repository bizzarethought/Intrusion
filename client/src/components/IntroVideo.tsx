import { useEffect, useRef } from 'react';
import { playGlitch } from '../audio';

/** The loading screen: the team's rendered video, with the glitch effect, played once as a match begins. */
export function IntroVideo({ onDone }: { onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const glitch = playGlitch();
    // The video has no soundtrack of its own, so it can always start muted (browsers allow that).
    video.current?.play().catch(onDone);
    return () => glitch?.pause();
  }, [onDone]);
  return (
    <div className="intro ui">
      <video ref={video} src="/assets/loading/loading_screen_reference.mp4" muted playsInline onEnded={onDone} onError={onDone} />
      <button className="button intro__skip" onClick={onDone}>Skip</button>
    </div>
  );
}
