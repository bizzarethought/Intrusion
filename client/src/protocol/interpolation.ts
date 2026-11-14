import type { LivePlayer } from './types';

/** A short render delay absorbs 10–20 Hz network jitter without predicting remote actions. */
export class PositionBuffer {
  private samples: Array<{ at: number; players: Map<string, LivePlayer> }> = [];
  private key = '';

  reset() { this.samples = []; this.key = ''; }

  push(players: LivePlayer[], phaseKey: string, at: number) {
    if (phaseKey !== this.key) { this.reset(); this.key = phaseKey; }
    this.samples.push({ at, players: new Map(players.map(player => [player.id, player])) });
    while (this.samples.length > 2 && this.samples[1].at < at - 500) this.samples.shift();
  }

  read(latest: LivePlayer[], selfId: string, now: number): LivePlayer[] {
    const target = now - 100;
    let left = this.samples[0];
    if (!left) return latest;
    let right = left;
    for (const sample of this.samples) {
      right = sample;
      if (sample.at >= target) break;
      left = sample;
    }
    const t = right.at === left.at ? 1 : Math.max(0, Math.min(1, (target - left.at) / (right.at - left.at)));
    return latest.map(player => {
      if (player.id === selfId) return player; // local prediction uses the latest authoritative position
      const a = left.players.get(player.id);
      const b = right.players.get(player.id);
      if (!a || !b) return player;
      // Respawns and corrections are teleports, not a glide through the level.
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1) return player;
      return { ...player, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    });
  }
}
