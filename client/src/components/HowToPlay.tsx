import type { SpriteAnimation, SpriteFrame } from '../assets/manifest';
import { Sprite } from './Sprite';

const STEPS: Array<{ title: string; text: string; variantId: string; animation?: SpriteAnimation; frame?: SpriteFrame }> = [
  { title: 'Run to the arena', text: 'Everyone spawns in the plaza and runs to the next mini-game.', variantId: 'cobalt', animation: 'walk_side' },
  { title: 'Compete for points', text: 'Every mini-game scores. Finishing early scores more.', variantId: 'sunflower', frame: 'emote_happy' },
  { title: 'Watch how they play', text: 'Too perfect? Too clumsy? How someone plays is your evidence.', variantId: 'violet', frame: 'emote_sus' },
  { title: 'Pass the Turing check', text: 'A surprise reaction test feeds the sus meter. It is a clue, not proof.', variantId: 'lime', frame: 'emote_blink' },
  { title: 'Argue and vote', text: 'After each mini-game, chat it out and vote someone out.', variantId: 'crimson', frame: 'emote_angry' },
  { title: 'Catch the AI', text: 'Vote out the hidden AI to win. If it survives every vote, it wins.', variantId: 'teal', frame: 'deactivated' },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="backdrop ui" onClick={onClose}>
      <div className="panel panel--wide" role="dialog" aria-modal="true" aria-label="How to play" onClick={(event) => event.stopPropagation()}>
        <header className="panel__header"><h2>How to play</h2><button className="button button--icon" onClick={onClose} aria-label="Close" autoFocus>✕</button></header>
        <ol className="steps">
          {STEPS.map((step) => (
            <li key={step.title} className="step">
              <Sprite variantId={step.variantId} animation={step.animation} frame={step.frame} size={110} />
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="muted">Every player sees different robot looks for everyone else, so "I'm the blue one" proves nothing.</p>
      </div>
    </div>
  );
}
