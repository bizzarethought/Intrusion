import { useState } from 'react';
import { play } from '../audio';
import { HowToPlay } from '../components/HowToPlay';
import { SoundToggle } from '../components/SettingsPanel';

export function LandingScreen({ onPlay }: { onPlay: () => void }) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className="screen landing">
      <div className="corner ui"><SoundToggle /></div>
      <h1 className="logo" data-text="Intrusion">Intrusion</h1>
      <p className="pitch">Everyone is playing. One of them is an AI.</p>
      <div className="row ui">
        <button className="button button--primary button--big" onClick={() => { play('click'); onPlay(); }}>Play</button>
        <button className="button button--big" onClick={() => { play('click'); setShowHelp(true); }}>How to play</button>
      </div>
      <footer className="credits">
A party game of nature against machine, made at Emory Hacks 2026. Every robot and every meadow was modelled and rendered in Blender by the team.
      </footer>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
