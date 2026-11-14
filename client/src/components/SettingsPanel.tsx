import { play, toggleMuted, useMuted } from '../audio';

/** Sound on/off. Used on every screen. */
export function SoundToggle() {
  const muted = useMuted();
  return (
    <button className="button button--icon" onClick={() => { toggleMuted(); play('click'); }} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

export function SettingsPanel({ onLeave, onClose }: { onLeave: () => void; onClose: () => void }) {
  const muted = useMuted();
  return (
    <div className="panel side-panel ui" role="dialog" aria-label="Settings">
      <header className="panel__header"><h2>Settings</h2><button className="button button--icon" onClick={onClose} aria-label="Close settings">✕</button></header>
      <label className="row"><span>Sound</span><button className="button" onClick={toggleMuted}>{muted ? 'Off' : 'On'}</button></label>
      <h3>Controls</h3>
      <ul className="plain">
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to run</li>
        <li>Click or tap the grass to walk there</li>
        <li><kbd>Tab</kbd> shows the scoreboard</li>
      </ul>
      <p className="muted">Animations follow your system's reduced-motion setting.</p>
      <button className="button button--danger" onClick={onLeave}>Leave match</button>
    </div>
  );
}
