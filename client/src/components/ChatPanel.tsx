import { useEffect, useRef, useState, type FormEvent } from 'react';
import { variantFor } from '../assets/looks';
import { variant } from '../assets/manifest';
import { send } from '../protocol/roomClient';
import { MAX_CHAT_LENGTH, type Snapshot } from '../protocol/types';

/**
 * Chat log and input. Messages are plain text (React escapes them), and the
 * AI's messages are drawn exactly like everyone else's.
 */
export function ChatPanel({ game, onClose }: { game: Snapshot; onClose?: () => void }) {
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const me = game.players.find((player) => player.id === game.selfId);
  const canSend = !me?.eliminated;

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [game.chat.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    send.chat(text);
    setDraft('');
  }

  return (
    <section className="chat" aria-label="Chat">
      <header className="panel__header"><h2>Chat</h2>{onClose && <button className="button button--icon" onClick={onClose} aria-label="Close chat">✕</button>}</header>
      <p className="chat__reminder">Keep your identity secret until the reveal.</p>
      <ol className="chat__log" ref={log} aria-live="polite">
        {game.chat.length === 0 && <li className="muted">No messages yet. Say what you saw.</li>}
        {game.chat.map((line) => {
          const author = game.players.find((player) => player.id === line.playerId);
          return (
            <li key={line.key} className={line.playerId === game.selfId ? 'chat__mine' : ''}>
              <span className="chat__author" style={{ color: variant(variantFor(line.playerId, game.selfId)).uiColor }}>{author?.name ?? 'Player'}</span>
              <small>Round {line.round}</small>
              <p>{line.message}</p>
            </li>
          );
        })}
      </ol>
      <form className="chat__form" onSubmit={submit}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={MAX_CHAT_LENGTH} disabled={!canSend}
          placeholder={canSend ? 'Make your case…' : 'You were voted out'} aria-label="Message" />
        <small className="muted">{draft.length}/{MAX_CHAT_LENGTH}</small>
        <button className="button button--primary button--small" disabled={!canSend || !draft.trim()}>Send</button>
      </form>
    </section>
  );
}
