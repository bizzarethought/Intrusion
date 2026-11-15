import { useState, type FormEvent } from 'react';
import { play } from '../audio';
import { send } from '../protocol/roomClient';
import type { Snapshot } from '../protocol/types';
import { useWorldHud } from '../scene/worldHud';

/** Reads the server's JSON list for a mini-game, or gives the fallback if it is missing or malformed. */
function parseBoard<T>(board: string, fallback: T): T {
  try {
    return board ? (JSON.parse(board) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Pick a Side: the question, with each answer on a square sign at the back of its platform, in
 * the platform's colour. The sign for the platform you are standing on is marked, and the middle
 * says what your pick is.
 */
export function SidePanel({ game }: { game: Snapshot }) {
  const { side } = useWorldHud();
  const counts = parseBoard<{ a?: number; b?: number }>(game.board, {});
  const decided = game.stage === 'result';
  const winner = decided && counts.a !== counts.b ? ((counts.a ?? 0) > (counts.b ?? 0) ? 'a' : 'b') : '';
  const watching = Boolean(game.players.find((player) => player.id === game.selfId)?.eliminated);
  const option = (key: 'a' | 'b', text: string, count = 0) => (
    <p className={`sides__option sides__option--${key}${side === key ? ' sides__option--here' : ''}${winner === key ? ' sides__option--won' : ''}`}>
      <small>{key === 'a' ? 'Red' : 'Blue'}</small>
      {text}
      {decided && <strong>{count}</strong>}
      {side === key && <span className="sides__here">You are here</span>}
    </p>
  );
  return (
    <section className="sides" aria-label="Pick a side" aria-live="polite">
      {option('a', game.optionA, counts.a)}
      <div className="sides__middle">
        <h2 className="sides__question">{game.prompt}</h2>
        {!watching && (
          <p className={`sides__status${side ? '' : ' sides__status--none'}`}>
            {side ? `Your pick: ${side === 'a' ? game.optionA : game.optionB}` : 'No pick yet. Walk to red or blue.'}
          </p>
        )}
      </div>
      {option('b', game.optionB, counts.b)}
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
