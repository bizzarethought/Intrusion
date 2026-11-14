// Where every supplied asset lives. Files are served from client/public.

/** Side-on robot portraits, for the UI: lobby, vote, scoreboard, reveal. */
export const SPRITE_DIR = '/assets/portraits/';

/** Looping animations in each sprite sheet. */
export type SpriteAnimation = 'idle_front' | 'walk_front' | 'idle_side' | 'walk_side' | 'idle_back' | 'walk_back';
/** Single frames in each sprite sheet. */
export type SpriteFrame = 'emote_happy' | 'emote_angry' | 'emote_sus' | 'emote_blink' | 'blink_side' | 'deactivated';

/** The ten robot looks: sprite sheet id and a UI colour (from the art's players.json). */
export const VARIANTS = [
  { id: 'original', uiColor: '#8a7a5c' },
  { id: 'crimson', uiColor: '#d91010' },
  { id: 'cobalt', uiColor: '#1440f2' },
  { id: 'lime', uiColor: '#59e61f' },
  { id: 'sunflower', uiColor: '#ffb80d' },
  { id: 'bubblegum', uiColor: '#ff59a6' },
  { id: 'violet', uiColor: '#802ee6' },
  { id: 'snow', uiColor: '#cce0ff' },
  { id: 'tangerine', uiColor: '#ff6b0d' },
  { id: 'teal', uiColor: '#0ab8a8' },
] as const;

export type VariantId = (typeof VARIANTS)[number]['id'];
export const variant = (id: string) => VARIANTS.find((v) => v.id === id) ?? VARIANTS[0];
