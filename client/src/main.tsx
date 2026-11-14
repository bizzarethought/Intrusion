import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createGame } from './game/game';
import './styles/theme.css';
import './styles/layout.css';
import './styles/animations.css';

// The game view is created once and lives for the whole visit; React draws the UI over it.
const game = createGame(document.getElementById('stage') as HTMLCanvasElement);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App game={game} />
  </StrictMode>
);
