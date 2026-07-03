import { describe, it, expect } from 'vitest';
import { randomEvent, EVENTS } from './events.js';

describe('randomEvent', () => {
  it('always returns a valid event from the pool', () => {
    for (let i = 0; i < 50; i++) {
      const ev = randomEvent();
      expect(EVENTS).toContain(ev);
    }
  });

  it('produces a non-trivial distribution over many draws', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      seen.add(randomEvent().id);
    }
    // With 200 draws over 4 events, we should see more than just one id.
    expect(seen.size).toBeGreaterThan(1);
  });
});
