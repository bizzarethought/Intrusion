# Android Bot player sprites (10 players)

Each player has its own `bot_<id>.png` sprite sheet and a `bot_<id>.json` atlas (TexturePacker "JSON Hash"
format, which loads directly in Phaser, PixiJS and similar engines). `players.json` lists all 10 for random anonymous assignment.

- Cell: 360×360 px, transparent background with a soft ground shadow. Anchor (0.5, 0.86) is at the feet.
- Side frames face RIGHT. Flip horizontally for left.
- Animations (suggested fps in each atlas): idle_side, walk_side, idle_front, walk_front, idle_back, walk_back
- Single frames: blink_side, emote_blink, emote_happy, emote_angry, emote_sus, deactivated (voted out)

| id | accessory |
|---|---|
| original | none (classic) |
| crimson | horns |
| cobalt | headphones |
| lime | propeller cap |
| sunflower | crown |
| bubblegum | bow |
| violet | wings |
| snow | halo |
| tangerine | moustache |
| teal | top hat |
