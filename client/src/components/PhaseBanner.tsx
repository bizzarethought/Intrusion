import { miniGameInfo } from '../protocol/types';

/** Sweeps across the screen as each round's mini-game is announced. */
export function PhaseBanner({ miniGame }: { miniGame: string }) {
  const info = miniGameInfo(miniGame);
  return (
    <div className="banner" aria-hidden="true">
      <strong>{info.name}</strong>
      <span>{info.how}</span>
    </div>
  );
}
