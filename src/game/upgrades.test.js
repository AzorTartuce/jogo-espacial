import { describe, it, expect } from 'vitest';
import { getUpgradeChoices, shouldOfferUpgrade, UPGRADE_POOL } from './upgrades.js';

describe('getUpgradeChoices', () => {
  it('returns the requested count when enough upgrades are available', () => {
    const choices = getUpgradeChoices([], 3);
    expect(choices.length).toBe(3);
  });

  it('never repeats an id within a single result', () => {
    const choices = getUpgradeChoices([], UPGRADE_POOL.length);
    const ids = choices.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never includes an id already picked', () => {
    const picked = [UPGRADE_POOL[0].id, UPGRADE_POOL[1].id];
    for (let i = 0; i < 20; i++) {
      const choices = getUpgradeChoices(picked, 3);
      for (const c of choices) {
        expect(picked).not.toContain(c.id);
      }
    }
  });

  it('returns fewer than requested when the available pool is smaller than count', () => {
    const picked = UPGRADE_POOL.slice(0, UPGRADE_POOL.length - 1).map((u) => u.id);
    const choices = getUpgradeChoices(picked, 3);
    expect(choices.length).toBe(1);
  });

  it('returns an empty list once every upgrade has been picked', () => {
    const picked = UPGRADE_POOL.map((u) => u.id);
    const choices = getUpgradeChoices(picked, 3);
    expect(choices).toEqual([]);
  });
});

describe('shouldOfferUpgrade', () => {
  it('is false outside duelo mode even when the turn count matches', () => {
    expect(
      shouldOfferUpgrade({ gameMode: 'classico', turnsPlayed: 3, pickedCount: 0 })
    ).toBe(false);
  });

  it('is false on turn 0', () => {
    expect(
      shouldOfferUpgrade({ gameMode: 'duelo', turnsPlayed: 0, pickedCount: 0 })
    ).toBe(false);
  });

  it('is false when turnsPlayed is not a multiple of 3', () => {
    expect(
      shouldOfferUpgrade({ gameMode: 'duelo', turnsPlayed: 4, pickedCount: 0 })
    ).toBe(false);
  });

  it('is true in duelo mode on a multiple-of-3 turn with upgrades left', () => {
    expect(
      shouldOfferUpgrade({ gameMode: 'duelo', turnsPlayed: 3, pickedCount: 0 })
    ).toBe(true);
  });

  it('is false once every upgrade has already been picked', () => {
    expect(
      shouldOfferUpgrade({
        gameMode: 'duelo',
        turnsPlayed: 6,
        pickedCount: UPGRADE_POOL.length,
      })
    ).toBe(false);
  });
});
