import { useState, type FormEvent } from 'react';
import { VARIANTS } from '../assets/manifest';
import { play } from '../audio';
import { SoundToggle } from '../components/SettingsPanel';
import { Sprite } from '../components/Sprite';
import { connect } from '../protocol/roomClient';
import { BACKEND_URL, MAX_NAME_LENGTH, type Snapshot } from '../protocol/types';

const previewLook = VARIANTS[Math.floor(Math.random() * VARIANTS.length)].id;

export function JoinScreen({ game, onBack }: { game: Snapshot; onBack: () => void }) {
  const [name, setName] = useState(() => localStorage.getItem('intrusion-name') ?? '');
  // A shared link (?room=CODE) fills the code in.
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '');
  const busy = game.status === 'connecting';
  const cleanName = name.trim();

  function go(mode: 'create' | 'join', event?: FormEvent) {
    event?.preventDefault();
    if (!cleanName || busy || (mode === 'join' && !code.trim())) return;
    localStorage.setItem('intrusion-name', cleanName);
    play('join');
    connect(mode, cleanName, code);
  }

  return (
    <div className="screen screen--center">
      <div className="corner ui"><SoundToggle /></div>
      <form className="panel panel--narrow ui" onSubmit={(event) => go(code.trim() ? 'join' : 'create', event)}>
        <header className="panel__header"><h2>Join a match</h2><button type="button" className="button button--icon" onClick={onBack} aria-label="Back">←</button></header>
        <div className="preview">
          <Sprite variantId={previewLook} size={120} />
          <p className="muted">Your robot looks different on every player's screen, so nobody can call you out by colour.</p>
        </div>
        <label className="field">
          <span>Display name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_NAME_LENGTH} placeholder="What should we call you?" autoFocus required />
        </label>
        <button type="button" className="button button--primary" onClick={() => go('create')} disabled={!cleanName || busy}>Create a room</button>
        <div className="divider">or join one</div>
        <label className="field">
          <span>Room code</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste the code from the host" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <button type="button" className="button" onClick={() => go('join')} disabled={!cleanName || !code.trim() || busy}>Join room</button>
        <p className="status" role="status" aria-live="polite">
          {busy ? <><span className="dot dot--busy" /> Connecting to {BACKEND_URL}…</> : game.error ? <span className="error">{game.error}</span> : <><span className="dot" /> Ready to connect</>}
        </p>
      </form>
    </div>
  );
}
