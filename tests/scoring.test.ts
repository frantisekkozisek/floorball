import { describe, it, expect, beforeEach } from 'vitest';
import { calculateShotScore, getPlayerTitle, addLeaderboardScore } from '../src/game/scoring';

describe('Scoring & Leaderboard (Bodovací systém a Síň slávy)', () => {
  beforeEach(() => {
    // Čisté mock prostředí pro localStorage
    const store: Record<string, string> = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store[k] || null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      },
    };
  });

  describe('calculateShotScore()', () => {
    it('udělí 500 bodů za vinkl a správně spočítá násobič brankáře', () => {
      const scoreJunior = calculateShotScore({
        targetLabel: '⭐ LEVÝ VINKL!',
        trickType: 'normal',
        durationSeconds: 4.0, // bez speed bonusu
        comboStreak: 0,       // 1.0x combo
        goalieLevel: 'junior', // 1.0x
      });

      // 500 (vinkl) + 100 (normal) + 0 (speed) = 600 * 1.0 * 1.0 = 600
      expect(scoreJunior.targetPoints).toBe(500);
      expect(scoreJunior.trickBonus).toBe(100);
      expect(scoreJunior.goalieMultiplier).toBe(1.0);
      expect(scoreJunior.totalPoints).toBe(600);

      const scoreLegend = calculateShotScore({
        targetLabel: '⭐ LEVÝ VINKL!',
        trickType: 'normal',
        durationSeconds: 4.0,
        comboStreak: 0,
        goalieLevel: 'legend', // 2.5x
      });

      // 600 * 2.5 = 1500
      expect(scoreLegend.goalieMultiplier).toBe(2.5);
      expect(scoreLegend.totalPoints).toBe(1500);
    });

    it('udělí bonus za ZORRO trik a rychlost nájezdu', () => {
      const score = calculateShotScore({
        targetLabel: '🚀 POD BŘEVNO!',
        trickType: 'zorro',
        durationSeconds: 1.0, // plný speed bonus 300
        comboStreak: 0,
        goalieLevel: 'junior',
      });

      // 350 (břevno) + 400 (zorro) + 300 (rychlost) = 1050
      expect(score.targetPoints).toBe(350);
      expect(score.trickBonus).toBe(400);
      expect(score.speedBonus).toBe(300);
      expect(score.totalPoints).toBe(1050);
    });

    it('správně aplikuje kombo sérii za po sobě jdoucí góly', () => {
      const comboScore = calculateShotScore({
        targetLabel: '⚡ K TYČI!',
        trickType: 'toe-drag',
        durationSeconds: 5.0,
        comboStreak: 4, // 5. gól v sérii -> 2.0x
        goalieLevel: 'profi', // 1.5x
      });

      // base: 250 + 250 = 500
      // 500 * 2.0 (combo) * 1.5 (profi) = 1500
      expect(comboScore.comboMultiplier).toBe(2.0);
      expect(comboScore.goalieMultiplier).toBe(1.5);
      expect(comboScore.totalPoints).toBe(1500);
    });
  });

  describe('getPlayerTitle()', () => {
    it('přiřadí správný titul podle bodů', () => {
      expect(getPlayerTitle(1000).title).toBe('Florbalový talent');
      expect(getPlayerTitle(3500).title).toBe('Ligový střelec');
      expect(getPlayerTitle(6500).title).toBe('Extraligová hvězda');
      expect(getPlayerTitle(9500).title).toBe('Mistr světa');
      expect(getPlayerTitle(15000).title).toBe('Nesmrtelná Legenda florbalu');
    });
  });

  describe('addLeaderboardScore()', () => {
    it('zařadí nový rekord na 1. místo, pokud překoná dosavadní maximum', () => {
      const result = addLeaderboardScore({
        name: 'JULINKA',
        number: 7,
        jerseyColor: '#ec4899',
        score: 12000,
        goals: 5,
        maxShots: 5,
        goalieLevel: 'legend',
      });

      expect(result.newRank).toBe(1);
      expect(result.leaderboard.length).toBe(3);
      expect(result.leaderboard[0].score).toBe(12000);
      expect(result.leaderboard[0].name).toBe('JULINKA');
    });

    it('nezařadí slabý výsledek, pokud nedosáhne na TOP 3', () => {
      const result = addLeaderboardScore({
        name: 'TESTER',
        number: 99,
        jerseyColor: '#1e293b',
        score: 500,
        goals: 1,
        maxShots: 5,
        goalieLevel: 'junior',
      });

      expect(result.newRank).toBeNull();
      expect(result.leaderboard.length).toBe(3);
      expect(result.leaderboard.some(e => e.name === 'TESTER')).toBe(false);
    });
  });
});
