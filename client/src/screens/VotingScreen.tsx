import { useState } from 'react';
import { play } from '../audio';
import { ChatPanel } from '../components/ChatPanel';
import { PlayerCard } from '../components/PlayerCard';
import { useCountdown } from '../hooks/useCountdown';
import { send } from '../protocol/roomClient';
import type { Snapshot } from '../protocol/types';

/** The meeting: argue in chat, pick a suspect, confirm. One vote each. */
export function VotingScreen({ game }: { game: Snapshot }) {
  const seconds = useCountdown(game.phaseEndsAt);
  // undefined = still choosing; null = skip; a string = that player's id.
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const me = game.players.find((player) => player.id === game.selfId);
  const candidates = game.players.filter((player) => !player.eliminated);
  const locked = sent || !me || me.eliminated;
  const chosen = candidates.find((player) => player.id === choice);

  function confirm() {
    if (choice === undefined || locked) return;
    send.vote(choice);
    setSent(true);
    play('vote');
  }

  return (
    <div className="backdrop ui">
      <div className="panel voting" role="dialog" aria-modal="true" aria-label="Vote">
        <header className="voting__header">
          <div><span className="kicker">Round {game.round}, under the oak</span><h2>Who is the machine?</h2></div>
          <div className={`hud__timer${seconds <= 10 ? ' hud__timer--low' : ''}`} role="timer">{seconds}s</div>
        </header>
        <div className="voting__body">
          <section aria-label="Suspects">
            <ul className="suspects">
              {candidates.map((player) => (
                <li key={player.id}>
                  <PlayerCard player={player} selfId={game.selfId} size={92} frame={choice === player.id ? 'emote_sus' : undefined}
                    selected={choice === player.id} disabled={locked || player.id === game.selfId} onClick={() => { setChoice(player.id); play('click'); }}>
                    <span className="card__meta">{player.score} pts</span>
                  </PlayerCard>
                </li>
              ))}
            </ul>
            <div className="voting__actions" role="status" aria-live="polite">
              {me?.eliminated ? <p className="muted">You were voted out, so you can't vote. Keep watching.</p>
                : sent ? <p className="result result--done">✓ Vote locked in{chosen ? ` for ${chosen.name}` : ' (skipped)'}. Waiting for the others…</p>
                : <>
                    <button className={`button${choice === null ? ' button--selected' : ''}`} onClick={() => setChoice(null)}>Skip vote</button>
                    <button className="button button--primary" onClick={confirm} disabled={choice === undefined}>
                      {choice === undefined ? 'Pick a suspect' : choice === null ? 'Confirm skip' : `Vote out ${chosen?.name ?? ''}`}
                    </button>
                  </>}
            </div>
          </section>
          <ChatPanel game={game} />
        </div>
      </div>
    </div>
  );
}
