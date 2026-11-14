import type { ReactNode } from 'react';
import { variantFor } from '../assets/looks';
import type { SpriteFrame } from '../assets/manifest';
import type { Player } from '../protocol/types';
import { Sprite } from './Sprite';

type Props = {
  player: Player;
  selfId: string;
  size?: number;
  frame?: SpriteFrame;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
};

/** A player's avatar and name. Becomes a button when given onClick. */
export function PlayerCard({ player, selfId, size = 96, frame, selected, onClick, disabled, children }: Props) {
  const body = (
    <>
      <Sprite variantId={variantFor(player.id, selfId)} frame={player.eliminated ? 'deactivated' : frame} size={size} />
      <span className="card__name"><span>{player.name}</span>{player.id === selfId && <span className="tag tag--you">you</span>}</span>
      {children}
    </>
  );
  const className = `card${selected ? ' card--selected' : ''}${player.eliminated ? ' card--out' : ''}`;
  return onClick
    ? <button className={className} onClick={onClick} disabled={disabled} aria-pressed={selected}>{body}</button>
    : <div className={className}>{body}</div>;
}
