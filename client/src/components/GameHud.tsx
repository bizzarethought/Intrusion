import { useCountdown } from '../hooks/useCountdown';
import { PHASE_LABELS, miniGameInfo, type Snapshot } from '../protocol/types';
import { useWorldHud } from '../scene/worldHud';
import { SoundToggle } from './SettingsPanel';

type Props = { game: Snapshot; unread: number; onScores: () => void; onChat: () => void; onSettings: () => void };

/** In play: where you are, how long is left, your score, and one line of guidance. */
export function GameHud({ game, unread, onScores, onChat, onSettings }: Props) {
  const seconds = useCountdown(game.phaseEndsAt);
  const hud = useWorldHud();
  const me = game.players.find((player) => player.id === game.selfId);
  const moving = game.phase === 'travel' || game.phase === 'minigame';

  return (
    <>
      <header className="hud">
        <div className="hud__where">
          <small>Round {game.round}</small>
          <strong>{moving ? miniGameInfo(game.miniGame).name : PHASE_LABELS[game.phase] ?? game.phase}</strong>
        </div>
        <div className={`hud__timer${seconds <= 10 && seconds > 0 ? ' hud__timer--low' : ''}`} role="timer" aria-label="Time left">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </div>
        <div className="hud__side">
          <span className="hud__score" aria-label="Your score">{me?.score ?? 0}<small>pts</small></span>
          <button className="button button--icon" onClick={onScores} aria-label="Scoreboard">🏆</button>
          <button className="button button--icon" onClick={onChat} aria-label={`Chat${unread ? `, ${unread} new` : ''}`}>
            💬{unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <SoundToggle />
          <button className="button button--icon" onClick={onSettings} aria-label="Settings">⚙</button>
        </div>
      </header>

      {moving && hud.signal && (
        <div className={`signal signal--${hud.signal}`} role="status" aria-live="assertive">
          {hud.signal === 'green' ? 'The rose is open. Go!' : 'THE ROSE IS WATCHING'}
        </div>
      )}
      {moving && hud.objective && <div className="objective" role="status" aria-live="polite">{hud.objective}</div>}
      {hud.result && <div className="toast" role="status">{hud.result}</div>}
    </>
  );
}
