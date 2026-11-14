import { useEffect, useRef } from 'react';
import { useAtlas } from '../assets/loadSprites';
import { variant, type SpriteAnimation, type SpriteFrame } from '../assets/manifest';
import { prefersReducedMotion } from '../audio';

type Props = {
  variantId: string;
  /** A looping animation (default idle, facing front)... */
  animation?: SpriteAnimation;
  /** ...or one still frame, such as an emote. */
  frame?: SpriteFrame;
  size?: number;
  flip?: boolean;
};

/** One of the supplied robot sprites. Shows a coloured disc while loading or if the sheet is missing. */
export function Sprite({ variantId, animation = 'idle_front', frame, size = 96, flip }: Props) {
  const atlas = useAtlas(variantId);
  const element = useRef<HTMLSpanElement>(null);
  const names = frame ? [frame] : atlas?.animations[animation] ?? [];
  const fps = atlas?.fps[animation] ?? 6;

  useEffect(() => {
    if (names.length < 2 || prefersReducedMotion()) return;
    let tick = 0;
    const timer = setInterval(() => {
      const rect = atlas?.frames[names[++tick % names.length]];
      if (rect && element.current) {
        const scale = size / rect.w;
        element.current.style.backgroundPosition = `${-rect.x * scale}px ${-rect.y * scale}px`;
      }
    }, 1000 / fps);
    return () => clearInterval(timer);
  }, [atlas, animation, frame, names, fps, size]);

  const rect = atlas?.frames[names[0]];
  if (!atlas || !rect) {
    return <span className="sprite sprite--fallback" style={{ width: size, height: size, background: variant(variantId).uiColor }} aria-hidden="true" />;
  }
  const scale = size / rect.w;
  return (
    <span
      ref={element}
      className="sprite"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${atlas.image})`,
        backgroundSize: `${atlas.width * scale}px ${atlas.height * scale}px`,
        backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
