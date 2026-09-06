import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePlayerConfig,
  loadPlayerConfig,
  addLeaderboardScore,
  loadLeaderboard,
  calculateShotScore,
} from '../src/game/scoring';
import { PlayerConfig } from '../src/game/types';

describe('Player Configuration & Leaderboard Persistence', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
        clear: () => { mockStorage = {}; },
      },
    };
  });

  describe('PlayerConfig (Jméno, číslo a barva dresu)', () => {
    it('vrátí výchozí konfiguraci, pokud v localStorage nic není', () => {
      const cfg = loadPlayerConfig();
      expect(cfg.name).toBe('JULINKA');
      expect(cfg.number).toBe(7);
      expect(cfg.jerseyColor).toBe('#ec4899');
    });

    it('úspěšně uloží a načte upraveného hráče', () => {
      const custom: PlayerConfig = {
        name: 'ELIŠKA',
        number: 10,
        jerseyColor: '#06b6d4',
      };
      savePlayerConfig(custom);

      const loaded = loadPlayerConfig();
      expect(loaded.name).toBe('ELIŠKA');
      expect(loaded.number).toBe(10);
      expect(loaded.jerseyColor).toBe('#06b6d4');
    });
  });

  describe('Leaderboard (Síň slávy - TOP 3)', () => {
    it('vrátí výchozí 3 záznamy, pokud je tabulka prázdná', () => {
      const board = loadLeaderboard();
      expect(board.length).toBe(3);
      expect(board[0].name).toBe('JULINKA');
      expect(board[0].score).toBeGreaterThanOrEqual(board[1].score);
      expect(board[1].score).toBeGreaterThanOrEqual(board[2].score);
    });

    it('udrží přesně maximálně 3 záznamy seřazené sestupně podle bodů', () => {
      // Výchozí jsou 7200, 4800, 3100
      // Přidáme výsledek s 5500 body -> měl by se dostat na 2. místo
      const result = addLeaderboardScore({
        name: 'ANETKA',
        number: 99,
        jerseyColor: '#f97316',
        score: 5500,
        goals: 5,
        maxShots: 5,
        goalieLevel: 'profi',
      });

      expect(result.newRank).toBe(2);
      expect(result.leaderboard.length).toBe(3);
      expect(result.leaderboard[0].score).toBe(7200);
      expect(result.leaderboard[1].score).toBe(5500);
      expect(result.leaderboard[1].name).toBe('ANETKA');
      expect(result.leaderboard[2].score).toBe(4800);
    });

    it('při shodě bodů rozhoduje vyšší počet vstřelených gólů', () => {
      // Dva hráči se stejnými body 6000
      addLeaderboardScore({
        name: 'HRÁČ A',
        number: 1,
        jerseyColor: '#ef4444',
        score: 6000,
        goals: 4,
        maxShots: 5,
        goalieLevel: 'profi',
      });

      addLeaderboardScore({
        name: 'HRÁČ B',
        number: 2,
        jerseyColor: '#10b981',
        score: 6000,
        goals: 5, // dal více gólů
        maxShots: 5,
        goalieLevel: 'legend',
      });

      const board = loadLeaderboard();
      const idxA = board.findIndex(e => e.name === 'HRÁČ A');
      const idxB = board.findIndex(e => e.name === 'HRÁČ B');
      expect(idxB).toBeLessThan(idxA);
    });
  });

  describe('Bodování & Kombo mechanika', () => {
    it('uděluje maximální kombo 2.0x při 5 gólech v řadě', () => {
      const shot1 = calculateShotScore({
        targetLabel: '⭐ LEVÝ VINKL!',
        trickType: 'toe-drag',
        durationSeconds: 1.0,
        comboStreak: 0,
        goalieLevel: 'junior',
      });
      expect(shot1.comboMultiplier).toBe(1.0);

      const shot5 = calculateShotScore({
        targetLabel: '⭐ LEVÝ VINKL!',
        trickType: 'toe-drag',
        durationSeconds: 1.0,
        comboStreak: 4,
        goalieLevel: 'junior',
      });
      expect(shot5.comboMultiplier).toBe(2.0);
      expect(shot5.totalPoints).toBe(shot1.totalPoints * 2);
    });

    it('pro gólmana Legenda dává 2.5x násobič', () => {
      const shot = calculateShotScore({
        targetLabel: 'Gól',
        trickType: 'normal',
        durationSeconds: 3.5,
        comboStreak: 0,
        goalieLevel: 'legend',
      });
      // base: 150 (gól) + 100 (normal) + 0 (speed) = 250
      // 250 * 2.5 = 625
      expect(shot.goalieMultiplier).toBe(2.5);
      expect(shot.totalPoints).toBe(625);
    });
  });
});
