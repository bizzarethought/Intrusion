import type { SpriteAnimation, SpriteFrame } from '../assets/manifest';
import { Sprite } from './Sprite';

const BEATS: Array<{ title: string; text: string; variantId: string; animation?: SpriteAnimation; frame?: SpriteFrame }> = [
  { title: 'Play', text: 'Run to each mini-game and score points.', variantId: 'cobalt', animation: 'walk_side' },
  { title: 'Watch', text: 'Too perfect? Too clumsy? How someone plays is your evidence.', variantId: 'violet', frame: 'emote_sus' },
  { title: 'Vote', text: 'After each game, argue it out and vote one player out.', variantId: 'crimson', frame: 'emote_angry' },
];
export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="backdrop ui" onClick={onClose}>
      <div className="panel panel--wide" role="dialog" aria-modal="true" aria-label="How to play" onClick={(event) => event.stopPropagation()}>
        <header className="panel__header"><h2>How to play</h2><button className="button button--small" onClick={onClose} autoFocus>Close</button></header>
        <p className="lede">One of you is an AI pretending to be a player. Find it.</p>
        <ol className="trail">
          {BEATS.map((beat) => (
            <li key={beat.title} className="beat">
              <Sprite variantId={beat.variantId} animation={beat.animation} frame={beat.frame} size={130} />
              <h3>{beat.title}</h3>
              <p>{beat.text}</p>
            </li>
          ))}
        </ol>
        <ul className="slips">
          <li>Vote out the AI and the humans win. If it survives every vote, it wins.</li>
          <li>Robot looks are different on every screen, so "I'm the blue one" proves nothing.</li>
        </ul>
      </div>
    </div>
  );
}
