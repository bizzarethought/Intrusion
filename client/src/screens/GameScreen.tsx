import { useEffect, useRef, useState } from 'react';
import { play } from '../audio';
import { ChatPanel } from '../components/ChatPanel';
import { GameHud } from '../components/GameHud';
import { PodiumPanel, SidePanel } from '../components/MiniGamePanels';
import { PhaseBanner } from '../components/PhaseBanner';
import { Scoreboard } from '../components/Scoreboard';
import { SettingsPanel } from '../components/SettingsPanel';
import { useCountdown } from '../hooks/useCountdown';
import { leave } from '../protocol/roomClient';
import type { Snapshot } from '../protocol/types';
import { RevealScreen } from './RevealScreen';
import { VotingScreen } from './VotingScreen';

/** Remembers scores at the start of each round and who was out before each vote. */
function useRoundTracker(game: Snapshot) {
  const memory = useRef({ phase: '', round: -1, scores: new Map<string, number>(), out: new Set<string>() });
  const seen = memory.current;
  if (seen.phase !== game.phase) {
    if (seen.round !== game.round) {
      seen.round = game.round;
      seen.scores = new Map(game.players.map((player) => [player.id, player.score]));
    }
    if (game.phase === 'voting' || seen.phase === '') seen.out = new Set(game.players.filter((p) => p.eliminated).map((p) => p.id));
    seen.phase = game.phase;
  }
  return {
    gains: new Map(game.players.map((player) => [player.id, player.score - (seen.scores.get(player.id) ?? 0)])),
    votedOut: game.players.filter((player) => player.eliminated && !seen.out.has(player.id)),
  };
}

/** 3, 2, 1 before a mini-game starts, then "Go!". It reads the server's clock, so every screen shows the same number. */
function Countdown({ game }: { game: Snapshot }) {
  const seconds = useCountdown(game.phaseEndsAt);
  const counting = game.phase === 'travel' && seconds > 0 && seconds <= 3;
  useEffect(() => { if (counting) play('click'); }, [counting, seconds]);
  // Prompt Podium has its card where the count-in usually goes, so there it sits higher.
  const place = game.miniGame === 'prompt-podium' ? ' countdown--high' : '';
  if (counting) return <div key={seconds} className={`countdown${place}`} role="status" aria-live="assertive">{seconds}</div>;
  // Stays mounted through the mini-game; its animation ends hidden.
  return game.phase === 'minigame' ? <div className={`countdown countdown--go${place}`} aria-hidden="true">Go!</div> : null;
}

/** Everything during a match: the HUD over the 3D world, plus whatever the phase needs. */
export function GameScreen({ game }: { game: Snapshot }) {
  const [open, setOpen] = useState<'scores' | 'chat' | 'settings' | null>(null);
  const [readCount, setReadCount] = useState(0);
  const { gains, votedOut } = useRoundTracker(game);
  const toggle = (panel: typeof open) => setOpen((now) => (now === panel ? null : panel));
  const moving = game.phase === 'travel' || game.phase === 'minigame';
  const ended = game.phase === 'reveal';
  const known = moving || ended || ['loading', 'voting', 'scoreboard'].includes(game.phase);
  // Chat is on screen during the vote and when its panel is open.
  const chatVisible = open === 'chat' || game.phase === 'voting';

  useEffect(() => { play('phase'); }, [game.phase]);
  useEffect(() => { if (chatVisible) setReadCount(game.chat.length); }, [chatVisible, game.chat.length]);
  useEffect(() => {
    // Tab shows the scoreboard, like most games.
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
      if (event.code === 'Tab') { event.preventDefault(); setOpen((now) => (now === 'scores' ? null : 'scores')); }
      else if (event.code === 'Enter' && !typing) { event.preventDefault(); setOpen('chat'); }
      else if (event.code === 'Escape') setOpen((now) => (now ? null : 'settings'));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  if (ended) return <RevealScreen game={game} />;

  return (
    <div className="screen game">
      <GameHud game={game} unread={game.chat.length - readCount} onScores={() => toggle('scores')} onChat={() => toggle('chat')} onSettings={() => toggle('settings')} />
      {game.phase === 'travel' && <PhaseBanner miniGame={game.miniGame} />}
      {moving && <Countdown game={game} />}
      {moving && game.miniGame === 'pick-a-side' && <SidePanel game={game} />}
      {moving && game.miniGame === 'prompt-podium' && <PodiumPanel key={game.round} game={game} />}
      {game.phase === 'voting' && <VotingScreen key={game.round} game={game} />}
      {game.phase === 'scoreboard' && <Scoreboard game={game} gains={gains} votedOut={votedOut} final />}
      {!known && (
        <div className="screen--center">
          <div className="panel panel--narrow ui" role="status">
            <h2>Hang tight</h2>
            <p>The server moved to a phase this version doesn't know yet ("{game.phase}"). The game will pick up at the next one.</p>
          </div>
        </div>
      )}
      {open === 'scores' && game.phase !== 'scoreboard' && <Scoreboard game={game} gains={gains} votedOut={[]} final={false} onClose={() => setOpen(null)} />}
      {open === 'chat' && game.phase !== 'voting' && <div className="panel side-panel ui"><ChatPanel game={game} onClose={() => setOpen(null)} /></div>}
      {open === 'settings' && <SettingsPanel onLeave={leave} onClose={() => setOpen(null)} />}
    </div>
  );
}
