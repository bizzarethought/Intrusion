import { useEffect, useState } from 'react';
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
  const [tick, setTick] = useState(0);
  const names = frame ? [frame] : atlas?.animations[animation] ?? [];
  const fps = atlas?.fps[animation] ?? 6;

  useEffect(() => {
    if (names.length < 2 || prefersReducedMotion()) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000 / fps);
    return () => clearInterval(timer);
  }, [names.length, fps]);

  const rect = atlas?.frames[names[tick % Math.max(1, names.length)]];
  if (!atlas || !rect) {
    return <span className="sprite sprite--fallback" style={{ width: size, height: size, background: variant(variantId).uiColor }} aria-hidden="true" />;
  }
  const scale = size / rect.w;
  return (
    <span
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
