import { useState } from 'react';
import { play } from '../audio';
import { SoundToggle } from '../components/SettingsPanel';
import { leave, send } from '../protocol/roomClient';
import { MIN_HUMANS, type Snapshot } from '../protocol/types';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(text).then(() => { setCopied(true); play('click'); setTimeout(() => setCopied(false), 1500); });
  return <button className="button button--small" onClick={copy}>{copied ? 'Copied' : label}</button>;
}

/** The players themselves stand under the oak in the scene, so this is one small card: the room, who is in, and Start. */
export function LobbyScreen({ game }: { game: Snapshot }) {
  const present = game.players.filter((player) => player.connected);
  const missing = Math.max(0, MIN_HUMANS - present.length);
  const isHost = game.hostId === game.selfId;
  const link = `${location.origin}/?room=${game.roomId}`;

  return (
    <div className="screen lobby">
      <div className="corner ui"><SoundToggle /><button className="button button--small" onClick={leave}>Leave</button></div>
      <section className="panel lobby__card ui" aria-label="Lobby">
        <span className="kicker">Room code</span>
        <div className="row"><strong className="code">{game.roomId}</strong><CopyButton text={game.roomId} label="Copy code" /></div>
        <div className="row"><code className="link">{link}</code><CopyButton text={link} label="Copy link" /></div>

        <header className="panel__header"><h3>Under the oak</h3><span className="pill">{present.length} of 10</span></header>
        <ul className="roster">
          {game.players.map((player) => (
            <li key={player.id} className={player.connected ? '' : 'roster__gone'}>
              <span className={`dot ${player.connected ? 'dot--on' : 'dot--off'}`} />
              <span className="roster__name">{player.name}</span>
              {player.id === game.selfId && <span className="tag tag--you">you</span>}
              {player.id === game.hostId && <span className="tag tag--host">host</span>}
              {!player.connected && <span className="tag">left</span>}
            </li>
          ))}
        </ul>
        <p className="status" role="status" aria-live="polite">
          {missing > 0 ? `Waiting for ${missing} more player${missing > 1 ? 's' : ''}.` : isHost ? 'Everyone is here. Start when you are ready.' : 'Waiting for the host to start.'}
        </p>
        <p className="muted">When the match starts, everyone gets a secret alias and a new look. Names are revealed at the end.</p>
        {isHost && <button className="button button--primary button--big" disabled={missing > 0} onClick={() => { play('phase'); send.startMatch(); }}>Start match</button>}
      </section>
    </div>
  );
}
