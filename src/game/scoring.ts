import { GoalieLevel, LeaderboardEntry, PlayerConfig, ShotScoreBreakdown, TrickType } from './types';

export const JERSEY_COLORS = [
  { name: 'Neonová růžová', hex: '#ec4899' },
  { name: 'Ledová tyrkysová', hex: '#06b6d4' },
  { name: 'Jedovatě zelená', hex: '#10b981' },
  { name: 'Zářivá oranžová', hex: '#f97316' },
  { name: 'Královská fialová', hex: '#8b5cf6' },
  { name: 'Ohnivá červená', hex: '#ef4444' },
  { name: 'Zlatá žlutá', hex: '#eab308' },
  { name: 'Noční černá', hex: '#1e293b' },
];

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  name: 'JULINKA',
  number: 7,
  jerseyColor: '#ec4899',
};

const LEADERBOARD_KEY = 'floorball_leaderboard_v1';
const PLAYER_CONFIG_KEY = 'floorball_player_config_v1';

export const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [
  { name: 'JULINKA', number: 7, jerseyColor: '#ec4899', score: 7200, goals: 5, maxShots: 5, goalieLevel: 'legend', date: 'Rekord' },
  { name: 'JULINKA', number: 7, jerseyColor: '#06b6d4', score: 4800, goals: 5, maxShots: 5, goalieLevel: 'profi', date: 'Včera' },
  { name: 'JULINKA', number: 7, jerseyColor: '#10b981', score: 3100, goals: 4, maxShots: 5, goalieLevel: 'junior', date: 'Tento týden' },
];

/**
 * Výpočet bodového zisku za vstřelenou branku
 */
export function calculateShotScore(params: {
  targetLabel?: string;
  trickType: TrickType;
  durationSeconds: number;
  comboStreak: number;
  goalieLevel: GoalieLevel;
}): ShotScoreBreakdown {
  const { targetLabel = '', trickType, durationSeconds, comboStreak, goalieLevel } = params;

  // 1. Body za zónu zakončení
  let targetPoints = 150;
  let zoneDesc = 'Gól do sítě';
  const labelUpper = targetLabel.toUpperCase();

  if (labelUpper.includes('VINKL')) {
    targetPoints = 500;
    zoneDesc = '⭐ VINKL!';
  } else if (labelUpper.includes('BŘEVNO') || labelUpper.includes('BREVNO')) {
    targetPoints = 350;
    zoneDesc = '🚀 POD BŘEVNO!';
  } else if (labelUpper.includes('TYČ') || labelUpper.includes('TYC')) {
    targetPoints = 250;
    zoneDesc = '⚡ K TYČI!';
  }

  // 2. Bonus za techniku / trik
  let trickBonus = 100;
  let trickDesc = 'Normální střela';
  if (trickType === 'zorro') {
    trickBonus = 400;
    trickDesc = '🌀 ZORRO trik';
  } else if (trickType === 'toe-drag') {
    trickBonus = 250;
    trickDesc = '⚡ Stahovačka';
  }

  // 3. Bonus za rychlost nájezdu (rychlé bleskové zakončení)
  let speedBonus = 0;
  if (durationSeconds <= 1.2) {
    speedBonus = 300;
  } else if (durationSeconds <= 3.0) {
    speedBonus = Math.round(Math.max(0, (3.0 - durationSeconds) / 1.8 * 300));
  }

  // 4. Kombo násobič za góly v řadě
  // 1. gól = 1.0x, 2. gól = 1.25x, 3. gól = 1.5x, 4. gól = 1.75x, 5. gól = 2.0x
  const clampedCombo = Math.max(0, Math.min(comboStreak, 4));
  const comboMultiplier = 1.0 + clampedCombo * 0.25;

  // 5. Násobič obtížnosti brankáře
  let goalieMultiplier = 1.0;
  if (goalieLevel === 'profi') goalieMultiplier = 1.5;
  else if (goalieLevel === 'legend') goalieMultiplier = 2.5;

  const basePoints = targetPoints + trickBonus + speedBonus;
  const totalPoints = Math.round(basePoints * comboMultiplier * goalieMultiplier);

  return {
    targetPoints,
    trickBonus,
    speedBonus,
    comboMultiplier,
    goalieMultiplier,
    totalPoints,
    shotDescription: `${zoneDesc} + ${trickDesc}`,
  };
}

/**
 * Získání titulu podle celkového skóre
 */
export function getPlayerTitle(score: number): { title: string; badge: string } {
  if (score >= 13000) return { title: 'Nesmrtelná Legenda florbalu', badge: '👑' };
  if (score >= 8500) return { title: 'Mistr světa', badge: '🏆' };
  if (score >= 5000) return { title: 'Extraligová hvězda', badge: '🥇' };
  if (score >= 2500) return { title: 'Ligový střelec', badge: '🥈' };
  return { title: 'Florbalový talent', badge: '🥉' };
}

/**
 * Správa konfigurace hráče (localStorage)
 */
export function loadPlayerConfig(): PlayerConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(PLAYER_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name && typeof parsed.number === 'number' && parsed.jerseyColor) {
          return parsed;
        }
      }
    }
  } catch (e) {
    // Ignorovat chyby localStorage
  }
  return { ...DEFAULT_PLAYER_CONFIG };
}

export function savePlayerConfig(config: PlayerConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(config));
    }
  } catch (e) {
    // Ignorovat chyby
  }
}

/**
 * Správa síně slávy (TOP 3)
 */
export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(LEADERBOARD_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3);
        }
      }
    }
  } catch (e) {
    // Ignorovat chyby
  }
  return [...DEFAULT_LEADERBOARD];
}

export function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 3)));
    }
  } catch (e) {
    // Ignorovat chyby
  }
}

/**
 * Zařazení výsledku do tabulky TOP 3
 */
export function addLeaderboardScore(entry: Omit<LeaderboardEntry, 'id' | 'date'> & { date?: string }): {
  newRank: number | null;
  leaderboard: LeaderboardEntry[];
} {
  const current = loadLeaderboard();
  const dateStr = entry.date || new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

  const newEntry: LeaderboardEntry = {
    ...entry,
    date: dateStr,
  };

  const combined = [...current, newEntry];
  combined.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.goals !== a.goals) return b.goals - a.goals;
    return 0;
  });

  const top3 = combined.slice(0, 3);
  const rankIndex = top3.findIndex(e => e === newEntry);
  const newRank = rankIndex >= 0 ? rankIndex + 1 : null;

  saveLeaderboard(top3);
  return { newRank, leaderboard: top3 };
}
