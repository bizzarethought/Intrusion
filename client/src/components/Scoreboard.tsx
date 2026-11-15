import { variantFor } from '../assets/looks';
import type { Player, Snapshot } from '../protocol/types';
import { clueFor } from './clue';
import { Sprite } from './Sprite';

type Props = {
  game: Snapshot;
  /** Points each player gained this round. */
  gains: Map<string, number>;
  /** Players voted out in the vote that just finished. */
  votedOut: Player[];
  /** Shown as the between-rounds screen (true) or opened by the player mid-round. */
  final: boolean;
  onClose?: () => void;
};

export function Scoreboard({ game, gains, votedOut, final, onClose }: Props) {
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  // The sus meter is the Turing check turned upside down: a clue, never proof.
  const sus = (player: Player) => 100 - Math.max(0, Math.min(100, player.turingScore));
  const mostSus = game.round > 0 ? [...game.players].filter((p) => !p.eliminated).sort((a, b) => sus(b) - sus(a))[0] : undefined;

  return (
    <div className="backdrop ui" onClick={onClose}>
      <div className="panel panel--wide scoreboard" role="dialog" aria-label="Scoreboard" onClick={(event) => event.stopPropagation()}>
        <header className="panel__header">
          <h2>Scoreboard</h2>
          {onClose && <button className="button button--icon" onClick={onClose} aria-label="Close scoreboard" autoFocus>Close</button>}
        </header>
        {final && (
          <p className="verdict">
            {votedOut.length ? <><strong>{votedOut.map((p) => p.name).join(', ')}</strong> was voted out.</> : 'Nobody was voted out this round.'}
          </p>
        )}
        <ol className="rows">
          {ranked.map((player, i) => (
            <li key={player.id} className={`rank${player.eliminated ? ' rank--out' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="rank__place">{i + 1}</span>
              <Sprite variantId={variantFor(player.id, game.selfId)} frame={player.eliminated ? 'deactivated' : undefined} size={56} />
              <span className="rank__name">
                {player.name}{player.id === game.selfId && <span className="tag tag--you">you</span>}
                {player.eliminated && <span className="tag tag--out">voted out</span>}
              </span>
              <span className={`clue clue--${clueFor(player).id}`} title="A clue, not a verdict">{game.round > 0 && !player.eliminated ? clueFor(player).label : ''}</span>
              <span className="rank__score">{player.score}{(gains.get(player.id) ?? 0) > 0 && <em className="gain">+{gains.get(player.id)}</em>}</span>
            </li>
          ))}
        </ol>
        {mostSus && sus(mostSus) > 55 && <p className="note">Sus meter: {mostSus.name}'s reactions looked unusual. It has been wrong before.</p>}
      </div>
    </div>
  );
}
