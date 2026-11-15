import { useState, type FormEvent } from 'react';
import { play } from '../audio';
import { send } from '../protocol/roomClient';
import type { Snapshot } from '../protocol/types';

/** Reads the server's JSON list for a mini-game, or gives the fallback if it is missing or malformed. */
function parseBoard<T>(board: string, fallback: T): T {
  try {
    return board ? (JSON.parse(board) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Pick a Side: the question, with each answer on the side of the screen you walk to for it. */
export function SidePanel({ game }: { game: Snapshot }) {
  const counts = parseBoard<{ a?: number; b?: number }>(game.board, {});
  const decided = game.stage === 'result';
  const winner = decided && counts.a !== counts.b ? ((counts.a ?? 0) > (counts.b ?? 0) ? 'a' : 'b') : '';
  return (
    <section className="sides" aria-label="Pick a side" aria-live="polite">
      <p className={`sides__option sides__option--roses${winner === 'a' ? ' sides__option--won' : ''}`}>
        <small>Roses, on the left</small>{game.optionA}{decided && <strong>{counts.a ?? 0}</strong>}
      </p>
      <h2 className="sides__question">{game.prompt}</h2>
      <p className={`sides__option sides__option--boulders${winner === 'b' ? ' sides__option--won' : ''}`}>
        <small>Boulders, on the right</small>{game.optionB}{decided && <strong>{counts.b ?? 0}</strong>}
      </p>
    </section>
  );
}

type PodiumEntry = { key: number; text: string; playerId?: string; votes?: number };
const ANSWER_LENGTH = 80;

/** Prompt Podium: type an answer, pick the funniest of the others, then see who wrote what. */
export function PodiumPanel({ game }: { game: Snapshot }) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const entries = parseBoard<PodiumEntry[]>(game.board, []);
  const me = game.players.find((player) => player.id === game.selfId);
  const out = Boolean(me?.eliminated);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || out) return;
    send.answer(text);
    setSent(text);
    play('click');
  }

  return (
    <section className="panel podium ui" aria-label="Prompt Podium">
      <span className="kicker">{game.phase === 'travel' ? 'Get ready to answer' : game.stage === 'vote' ? 'Pick the funniest' : game.stage === 'results' ? 'Who wrote what' : 'Type your answer'}</span>
      <h2>{game.prompt}</h2>

      {game.stage === 'answer' && !out && (
        <form className="podium__form" onSubmit={submit}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={ANSWER_LENGTH} placeholder="Your answer" aria-label="Your answer"
            disabled={game.phase !== 'minigame'} autoFocus />
          <button className="button button--primary" disabled={!draft.trim() || game.phase !== 'minigame'}>{sent ? 'Change it' : 'Lock it in'}</button>
        </form>
      )}
      {game.stage === 'answer' && sent && <p className="result result--done" role="status">Locked in: "{sent}". You can change it until time runs out.</p>}
      {game.stage === 'answer' && out && <p className="muted">You were voted out, so you are watching this one.</p>}

      {game.stage === 'vote' && (
        <ul className="podium__answers">
          {entries.map((entry) => {
            const mine = entry.text === sent; // the server also refuses a vote for your own answer
            return (
              <li key={entry.key}>
                <button className={`button${picked === entry.key ? ' button--selected' : ''}`} disabled={out || mine || picked !== null}
                  onClick={() => { send.pick(entry.key); setPicked(entry.key); play('vote'); }}>
                  {entry.text}{mine && <span className="tag tag--you">yours</span>}
                </button>
              </li>
            );
          })}
          {entries.length === 0 && <li className="muted">Nobody answered in time.</li>}
        </ul>
      )}
      {game.stage === 'vote' && picked !== null && <p className="result result--done" role="status">Vote in. Waiting for the others.</p>}

      {game.stage === 'results' && (
        <ol className="podium__answers">
          {entries.map((entry) => (
            <li key={entry.key} className="podium__result">
              <span>"{entry.text}"</span>
              <small>{game.players.find((player) => player.id === entry.playerId)?.name ?? 'Someone'}</small>
              <strong>{entry.votes ?? 0} {entry.votes === 1 ? 'vote' : 'votes'}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
