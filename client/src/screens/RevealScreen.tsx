import { variantFor } from '../assets/looks';
import { playGlitch } from '../audio';
import { PlayerCard } from '../components/PlayerCard';
import { Sprite } from '../components/Sprite';
import { leave } from '../protocol/roomClient';
import type { Player, Snapshot } from '../protocol/types';
import { useEffect } from 'react';

const average = (players: Player[], pick: (player: Player) => number) =>
  players.length ? Math.round(players.reduce((sum, player) => sum + pick(player), 0) / players.length) : 0;

/**
 * The end of the match. `isBot` is only present because the server has reached
 * the reveal; before that the protocol layer strips it.
 */
export function RevealScreen({ game }: { game: Snapshot }) {
  const bot = game.players.find((player) => player.isBot);
  const humans = game.players.filter((player) => !player.isBot);
  const survivors = humans.filter((player) => !player.eliminated);
  const caught = game.winner ? game.winner === 'humans' : Boolean(bot?.eliminated);
  useEffect(() => { const glitch = playGlitch(); return () => glitch?.pause(); }, []);

  const detective = [...humans].sort((a, b) => b.score - a.score)[0];

  return (
    <div className="backdrop backdrop--machine ui">
      <div className="machine reveal" role="dialog" aria-modal="true" aria-label="Reveal">
        <p className="reveal__lead step-1">The AI was…</p>
        {bot ? (
          <div className="reveal__bot step-2">
            <span className="glitch-frame"><Sprite variantId={variantFor(bot.id, game.selfId)} frame="emote_angry" size={170} /></span>
            <h2>{bot.name}</h2>
          </div>
        ) : (
          <h2 className="step-2">…nobody. There was no AI this match.</h2>
        )}
        <p className={`reveal__verdict step-3 ${caught ? 'reveal__verdict--humans' : 'reveal__verdict--ai'}`}>
          {!bot ? 'Everyone was human all along.' : caught ? 'HUMANS WIN. The AI was voted out.' : 'THE AI WINS. It survived every vote.'}
        </p>

        {bot && (
          <ul className="compare step-4" aria-label="The AI against the human average">
            <li><span>Score</span><strong>{bot.score}</strong><em>humans averaged {average(humans, (p) => p.score)}</em></li>
            <li><span>Humans still standing</span><strong>{survivors.length} of {humans.length}</strong><em>{caught ? 'the AI was voted out' : 'the AI never was'}</em></li>
          </ul>
        )}
        <ul className="whowas step-4" aria-label="Who was who">
          {game.players.map((player) => (
            <li key={player.id} className={player.isBot ? 'whowas__ai' : ''}><span>{player.name}</span><strong>{player.isBot ? 'the AI' : player.realName || 'Human'}</strong></li>
          ))}
        </ul>
        {detective && (
          <ul className="awards step-5">
            <li className="award">
              <h3>Sharpest Detective</h3>
              <PlayerCard player={{ ...detective, eliminated: false }} selfId={game.selfId} size={72} frame="emote_happy" />
              <small className="muted">Top score among the humans</small>
            </li>
          </ul>
        )}

        <div className="row step-6">
          <button className="button button--primary button--big" onClick={leave}>Play again</button>
        </div>
        <p className="muted step-6">Play again takes you back to the menu to create or join a new room.</p>
      </div>
    </div>
  );
}
