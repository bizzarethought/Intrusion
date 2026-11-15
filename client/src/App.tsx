import { useCallback, useEffect, useState } from 'react';
import { loadAtlas } from './assets/loadSprites';
import { variantFor } from './assets/looks';
import { prefersReducedMotion, setMusic } from './audio';
import { IntroVideo } from './components/IntroVideo';
import type { Game } from './game/game';
import { useGameRoom } from './hooks/useGameRoom';
import { leave } from './protocol/roomClient';
import { GameScreen } from './screens/GameScreen';
import { JoinScreen } from './screens/JoinScreen';
import { LandingScreen } from './screens/LandingScreen';
import { LobbyScreen } from './screens/LobbyScreen';

/** Picks the screen from the connection and game phase, and keeps the game view and music in step. */
export function App({ game: view }: { game: Game }) {
  const game = useGameRoom();
  const [screen, setScreen] = useState<'landing' | 'join'>('landing');
  const [introFailed, setIntroFailed] = useState(false);
  const failIntro = useCallback(() => setIntroFailed(true), []);
  const connected = game.status === 'connected';
  const inLobby = game.phase === 'lobby';
  // The server holds everyone in a loading phase while the video plays (not shown for reduced motion, or if it cannot play).
  const watchingIntro = connected && game.phase === 'loading' && !introFailed && !prefersReducedMotion();

  useEffect(() => {
    view.setScene(!connected ? 'attract' : inLobby ? 'lobby' : 'play');
    if (!connected || inLobby) setIntroFailed(false);
  }, [view, connected, inLobby]);

  useEffect(() => {
    if (!connected) setMusic('menu');
    else if (inLobby) setMusic('lobby');
    else if (watchingIntro || game.phase === 'reveal' || game.phase === 'game-over') setMusic(null);
    else setMusic(game.phase === 'voting' ? 'voting' : 'minigame');
  }, [connected, inLobby, watchingIntro, game.phase]);

  // Fetch every player's portrait as soon as they are known, so the vote screen opens with faces, not blanks.
  const playerIds = game.players.map((player) => player.id).join(',');
  useEffect(() => {
    if (game.selfId) for (const id of playerIds.split(',')) if (id) loadAtlas(variantFor(id, game.selfId));
  }, [playerIds, game.selfId]);

  if (game.status === 'disconnected') {
    return (
      <div className="screen screen--center ui">
        <div className="panel panel--narrow" role="alert">
          <h2>Connection lost</h2>
          <p>{game.error || 'The game server stopped answering.'}</p>
          <button className="button button--primary" onClick={leave}>Back to the menu</button>
        </div>
      </div>
    );
  }
  if (connected && inLobby) return <LobbyScreen game={game} />;
  if (watchingIntro) return <IntroVideo endsAt={game.phaseEndsAt} onFail={failIntro} />;
  if (connected) return <GameScreen game={game} />;
  return screen === 'landing'
    ? <LandingScreen onPlay={() => setScreen('join')} />
    : <JoinScreen game={game} onBack={() => setScreen('landing')} />;
}
