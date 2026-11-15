import { useEffect, useMemo, useRef, useState } from 'react';
import { play } from '../audio';
import { useCountdown } from '../hooks/useCountdown';
import { serverNow } from '../protocol/roomClient';
import { miniGameInfo, type Snapshot } from '../protocol/types';

/**
 * Before each mini-game: what it is, the rules and the controls, on a card that stays up for
 * the whole get-ready phase, along the bottom where it covers none of the level. The count-in
 * (3, 2, 1) stands on top of the card and reads the server's clock, so every screen shows the
 * same number. Then "Go!" for a moment as play starts.
 */
export function GetReady({ game }: { game: Snapshot }) {
  const seconds = useCountdown(game.phaseEndsAt);
  const ready = game.phase === 'travel';
  const counting = ready && seconds > 0 && seconds <= 3;
  useEffect(() => { if (counting) play('click'); }, [counting, seconds]);

  const [go, setGo] = useState(false);
  const phaseBefore = useRef(game.phase);
  useEffect(() => {
    const started = phaseBefore.current === 'travel' && game.phase === 'minigame';
    phaseBefore.current = game.phase;
    if (!started) return;
    setGo(true);
    const timer = setTimeout(() => setGo(false), 1_100);
    return () => clearTimeout(timer);
  }, [game.phase]);

  // The bar along the card's foot drains over whatever was left of get-ready when the card appeared.
  const remaining = useMemo(() => Math.max(0, game.phaseEndsAt - serverNow()), [game.phaseEndsAt]);
  const info = miniGameInfo(game.miniGame);
  const out = Boolean(game.players.find((player) => player.id === game.selfId)?.eliminated);

  if (!ready) return go ? <div className="ready"><div className="ready__count ready__count--go" aria-hidden="true">Go!</div></div> : null;
  return (
    <div className="ready">
      {counting && <div key={seconds} className="ready__count" role="status" aria-live="assertive">{seconds}</div>}
      <section className="ready__card" role="status" aria-label={`Get ready: ${info.name}`}>
        <span className="ready__kicker">Round {game.round} · get ready</span>
        <h2 className="ready__name">{info.name}</h2>
        <p className="ready__how">{info.how}</p>
        {game.miniGame === 'prompt-podium' && game.prompt && <p className="ready__prompt">The prompt: <strong>{game.prompt}</strong></p>}
        <p className={`ready__controls${info.loud ? ' ready__controls--loud' : ''}`}>{info.controls}</p>
        {out && <p className="ready__how">You were voted out, so you are watching this one.</p>}
        <span className="ready__bar" style={{ animationDuration: `${remaining}ms` }} aria-hidden="true" />
      </section>
    </div>
  );
}
