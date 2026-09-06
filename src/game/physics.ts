import { TouchPoint, TrickType, ShotParams, Ball, GoalDimensions, PartitionedStroke, ShotTarget } from './types';

/**
 * Analyzuje dotyková gesta a rozpoznává florbalové triky:
 * 1. 'zorro' - výrazně obloukový pohyb (flick po kružnici nahoru)
 * 2. 'toe-drag' (stahovačka) - pohyb nejdřív do strany / lehce vzad a pak prudký švih dopředu
 * 3. 'normal' - přímý švih na branku
 */
export function analyzeGesture(points: TouchPoint[]): ShotParams | null {
  if (!points || points.length < 2) return null;

  const lastPoint = points[points.length - 1];

  // Použijeme body z posledních 280 ms pro zjištění směru a rychlosti odpalu
  const recentThreshold = lastPoint.time - 280;
  const recentPoints = points.filter((p) => p.time >= recentThreshold);
  const activePoints = recentPoints.length >= 2 ? recentPoints : points;

  const start = activePoints[0];
  const end = activePoints[activePoints.length - 1];
  const durationMs = Math.max(end.time - start.time, 16);

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Střela musí směřovat nahoru směrem k brance (dy záporné)
  if (dy > -15) {
    return null; // Pohyb dozadu nebo na místě
  }

  const directDistance = Math.hypot(dx, dy);
  if (directDistance < 20) {
    return null; // Příliš neznatelný pohyb
  }

  // Výpočet celkové délky a odchylky přes všechny body gesta
  let pathLength = 0;
  let maxSideDeviation = 0;
  let hasLateralHook = false;
  const totalDx = lastPoint.x - points[0].x;
  const totalDy = lastPoint.y - points[0].y;
  const totalDist = Math.max(Math.hypot(totalDx, totalDy), 1);

  for (let i = 1; i < points.length; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    pathLength += Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);

    const numerator = Math.abs(totalDy * pCurr.x - totalDx * pCurr.y + lastPoint.x * points[0].y - lastPoint.y * points[0].x);
    const deviation = numerator / totalDist;
    if (deviation > maxSideDeviation) {
      maxSideDeviation = deviation;
    }

    if (i < points.length * 0.6) {
      const stepDy = pCurr.y - pPrev.y;
      const stepDx = Math.abs(pCurr.x - pPrev.x);
      if (stepDx > 12 && stepDy >= -5) {
        hasLateralHook = true;
      }
    }
  }

  // Rozpoznání triku
  let type: TrickType = 'normal';
  let curve = 0;
  let lift = 0.5;

  if (hasLateralHook) {
    // Výrazné stažení do strany na začátku = stahovačka
    type = 'toe-drag';
    curve = (dx > 0 ? -1 : 1) * 0.5; // Finta do protipohybu
    lift = 0.35; // Rychlá střela po zemi / k tyči
  } else if ((maxSideDeviation > 38 && pathLength / totalDist > 1.1) || maxSideDeviation > 50) {
    // Plynulý velký oblouk = zorro trik
    type = 'zorro';
    curve = (dx > 0 ? 1 : -1) * 0.8;
    lift = 0.95; // Zorro zvedá míček pod břevno
  } else if (maxSideDeviation > 25 && pathLength / totalDist > 1.12) {
    type = 'toe-drag';
    curve = (dx > 0 ? -1 : 1) * 0.5;
    lift = 0.35;
  } else {
    type = 'normal';
    curve = (dx / (Math.abs(dy) + 1)) * 0.3;
    lift = 0.55;
  }

  // Výpočet rychlosti (pixely za sekundu s limitací)
  const rawSpeed = (directDistance / durationMs) * 1000;
  const speed = Math.min(Math.max(rawSpeed * 1.1, 450), 1300);

  return {
    type,
    startX: start.x,
    startY: start.y,
    targetX: end.x + curve * 40,
    targetY: end.y,
    speed,
    curve,
    lift,
  };
}


/**
 * Analyzuje nakreslenou trasu běhu po hřišti a určí, o jaký florbalový trik šlo:
 * - 'toe-drag' (stahovačka): trasa má prudký úhyb / zářez do strany
 * - 'zorro': trasa tvoří plynulý velký oblouk
 * - 'normal': přímější běh na branku
 */
export function analyzeDrawnPath(path: { x: number; y: number }[]): TrickType {
  if (path.length < 3) return 'normal';

  const start = path[0];
  const end = path[path.length - 1];
  const totalDx = end.x - start.x;
  const totalDy = end.y - start.y;
  const directDist = Math.max(Math.hypot(totalDx, totalDy), 1);

  let pathLen = 0;
  let maxDeviation = 0;
  let hasSharpCut = false;

  for (let i = 1; i < path.length; i++) {
    const pPrev = path[i - 1];
    const pCurr = path[i];
    pathLen += Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);

    const num = Math.abs(totalDy * pCurr.x - totalDx * pCurr.y + end.x * start.y - end.y * start.x);
    const dev = num / directDist;
    if (dev > maxDeviation) maxDeviation = dev;

    // Detekce ostrého zářezu / stahovačky do strany (pohyb do strany je výrazně větší než dopředu)
    const stepDx = Math.abs(pCurr.x - pPrev.x);
    const stepDy = pCurr.y - pPrev.y;
    if (stepDx > 25 && stepDx > Math.abs(stepDy) * 1.3) {
      hasSharpCut = true;
    }
  }

  if (hasSharpCut) return 'toe-drag';
  if (maxDeviation > 40 && pathLen / directDist > 1.12) return 'zorro';
  return 'normal';
}

/**
 * Rozdělí nakreslené body tahu na:
 * 1. `runPath`: trasu běhu Julinky po palubovce (zastaví se před brankovištěm na Y >= 285).
 * 2. `shotTarget`: přesný cíl v brance (x, y v brankovém rámu, výška z a atraktivní popisek).
 * 3. `releasePoint`: bod, odkud Julinka po doběhu vystřelí.
 */
export const AIM_OFFSET_Y = 55; // Zaměřovač 55 px nad prstem hráče
export const SNAP_ENTER_RADIUS = 54; // Vzdálenost pro magnetické přitažení do kapsy
export const SNAP_HOLD_RADIUS = 76;  // Hystereze pro udržení zámku

export interface GoalPocket {
  id: string;
  x: number;
  y: number;
  z: number;
  label: string;
  badgeColor: string;
}

export function getGoalTargetPockets(goal: GoalDimensions): GoalPocket[] {
  const xL = goal.x - goal.width * 0.38;
  const xR = goal.x + goal.width * 0.38;
  const xM = goal.x;

  const yTop = goal.y - goal.height * 0.80; // vinkly
  const yBar = goal.y - goal.height * 0.88; // břevno
  const yBottom = goal.y - 18;             // tyčky u země

  return [
    {
      id: 'vinkl_left',
      label: '⭐ LEVÝ VINKL!',
      badgeColor: '#ffe600',
      x: xL,
      y: yTop,
      z: 118,
    },
    {
      id: 'bar',
      label: '🚀 POD BŘEVNO!',
      badgeColor: '#00ffcc',
      x: xM,
      y: yBar,
      z: 124,
    },
    {
      id: 'vinkl_right',
      label: '⭐ PRAVÝ VINKL!',
      badgeColor: '#ffe600',
      x: xR,
      y: yTop,
      z: 118,
    },
    {
      id: 'post_left',
      label: '⚡ K LEVÉ TYČI!',
      badgeColor: '#ff2a6d',
      x: goal.x - goal.width * 0.40,
      y: yBottom,
      z: 22,
    },
    {
      id: 'post_right',
      label: '⚡ K PRAVÉ TYČI!',
      badgeColor: '#ff2a6d',
      x: goal.x + goal.width * 0.40,
      y: yBottom,
      z: 22,
    },
  ];
}

/**
 * Rozdělí nakreslené body tahu na:
 * 1. `runPath`: trasu běhu Julinky po palubovce (zastaví se před brankovištěm na Y >= 285).
 * 2. `shotTarget`: přesný cíl v brance s magnetickým zámkem do 5 kapes (s posunem 55 px nad prst).
 * 3. `releasePoint`: bod, odkud Julinka po doběhu vystřelí.
 */
export function partitionStroke(
  points: { x: number; y: number }[],
  goal: GoalDimensions,
  previousTarget?: ShotTarget | null
): PartitionedStroke {
  const MIN_RUN_Y = 285; // Přední hranice brankoviště – kam Julinka doběhne
  const pockets = getGoalTargetPockets(goal);

  if (!points || points.length === 0) {
    const defaultTarget: ShotTarget = {
      x: goal.x,
      y: goal.y - 70,
      z: 70,
      label: 'PŘÍMÁ STŘELA! 🎯',
      badgeColor: '#00ffcc',
    };
    return {
      runPath: [{ x: goal.x, y: 780 }],
      shotTarget: defaultTarget,
      releasePoint: { x: goal.x, y: 780 },
    };
  }

  // 1. Rozdělení trasy běhu (zastaví se před brankovištěm na MIN_RUN_Y)
  let transitionIdx = -1;
  for (let i = 0; i < points.length; i++) {
    if (points[i].y < MIN_RUN_Y) {
      transitionIdx = i;
      break;
    }
  }

  let runPath: { x: number; y: number }[] = [];
  let releasePoint: { x: number; y: number };

  if (transitionIdx > 0) {
    // Část bodů je na hřišti a konec tahu míří do branky
    runPath = points.slice(0, transitionIdx);
    const pBefore = points[transitionIdx - 1];
    const pAfter = points[transitionIdx];
    const ratio = (MIN_RUN_Y - pBefore.y) / (pAfter.y - pBefore.y);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    releasePoint = {
      x: pBefore.x + (pAfter.x - pBefore.x) * clampedRatio,
      y: MIN_RUN_Y,
    };
    runPath.push(releasePoint);
  } else if (transitionIdx === 0) {
    // Tah začal rovnou v zóně branky
    releasePoint = { x: points[0].x, y: MIN_RUN_Y };
    runPath = [{ x: points[0].x, y: MIN_RUN_Y }];
  } else {
    // Všechny body jsou na palubovce
    runPath = [...points];
    releasePoint = points[points.length - 1];
  }

  // 2. Výpočet virtuálního zaměřovacího bodu (aimPos) s offsetem 55 px nad prst
  const lastPoint = points[points.length - 1];
  let aimPos: { x: number; y: number };

  if (lastPoint.y < MIN_RUN_Y + 70) {
    // Prst je v horní části u branky -> virtuální mířidlo je 55 px nad prstem
    // Omezíme mířidlo, aby nepřestřelilo nad břevno ani pod brankovou čáru
    const minSightY = goal.y - goal.height * 0.92;
    const maxSightY = goal.y - 10;
    aimPos = {
      x: lastPoint.x,
      y: Math.max(minSightY, Math.min(maxSightY, lastPoint.y - AIM_OFFSET_Y)),
    };
  } else {
    // Prst je na palubovce -> projekce ze směru posledních bodů tahu
    const sampleCount = Math.min(6, points.length);
    const pStart = points[Math.max(0, points.length - sampleCount)];
    const dx = lastPoint.x - pStart.x;
    const dy = lastPoint.y - pStart.y;

    if (dy < -2) {
      const t = (goal.y - 70 - lastPoint.y) / dy;
      aimPos = {
        x: lastPoint.x + dx * t,
        y: goal.y - 70,
      };
    } else {
      aimPos = {
        x: lastPoint.x,
        y: goal.y - 70,
      };
    }
  }

  // 3. Hledání magnetické kapsy v brance s hysterezí
  let matchedPocket: GoalPocket | null = null;
  let minPocketDist = Infinity;

  for (const pocket of pockets) {
    const dist = Math.hypot(aimPos.x - pocket.x, aimPos.y - pocket.y);
    const isPreviouslyLocked = previousTarget && previousTarget.label === pocket.label;
    const threshold = isPreviouslyLocked ? SNAP_HOLD_RADIUS : SNAP_ENTER_RADIUS;

    if (dist <= threshold && dist < minPocketDist) {
      minPocketDist = dist;
      matchedPocket = pocket;
    }
  }

  let targetX = goal.x;
  let targetY = goal.y - 70;
  let targetZ = 70;
  let label = '🎯 PŘÍMÁ STŘELA!';
  let badgeColor = '#00ffcc';

  if (matchedPocket) {
    targetX = matchedPocket.x;
    targetY = matchedPocket.y;
    targetZ = matchedPocket.z;
    label = matchedPocket.label;
    badgeColor = matchedPocket.badgeColor;
  } else {
    // Cíl je v prostoru sítě mimo magnetické rohy
    const minGoalX = goal.x - goal.width * 0.42;
    const maxGoalX = goal.x + goal.width * 0.42;
    targetX = Math.max(minGoalX, Math.min(maxGoalX, aimPos.x));
    targetY = Math.max(goal.y - goal.height + 10, Math.min(goal.y - 10, aimPos.y));
    targetZ = Math.max(15, Math.min(125, goal.y - targetY));

    if (targetZ >= 85) {
      label = '🚀 POD BŘEVNO!';
      badgeColor = '#00ffcc';
    } else if (targetZ <= 35) {
      label = '🎯 PO ZEMI!';
      badgeColor = '#00ffcc';
    } else if (targetX < goal.x - 30) {
      label = '⚡ K LEVÉ TYČI!';
      badgeColor = '#ff2a6d';
    } else if (targetX > goal.x + 30) {
      label = '⚡ K PRAVÉ TYČI!';
      badgeColor = '#ff2a6d';
    } else {
      label = '🎯 PŘÍMÁ STŘELA!';
      badgeColor = '#00ffcc';
    }
  }

  return {
    runPath,
    shotTarget: {
      x: targetX,
      y: targetY,
      z: targetZ,
      label,
      badgeColor,
    },
    releasePoint,
  };
}

/**
 * Vypočítá počáteční 2.5D rychlost míčku (vx, vy, vz), aby přesně zasáhl vybraný cíl v brance.
 */
export function calculateShotVelocity(
  startPos: { x: number; y: number },
  target: { x: number; y: number; z: number },
  goalY: number,
  baseSpeed: number = 760
): { vx: number; vy: number; vz: number; flightTime: number } {
  const dy = goalY - startPos.y; // dy < 0 (letí dopředu na branku)
  const dx = target.x - startPos.x;
  const dist = Math.max(Math.hypot(dx, dy), 1);

  // Doba letu na brankovou čáru
  const flightTime = Math.max(0.18, dist / baseSpeed);

  const vx = dx / flightTime;
  const vy = dy / flightTime;

  // Gravitace v našem fyzikálním modelu: ball.vz -= 340 * dt
  // Z(t) = vz * t - 0.5 * g * t^2  =>  vz = (target.z + 0.5 * 340 * t^2) / t
  const g = 340;
  const vz = (target.z + 0.5 * g * flightTime * flightTime) / flightTime;

  return { vx, vy, vz, flightTime };
}


/**
 * Zkontroluje, zda míček překročil brankovou čáru a zda je to gól, tyčka nebo mimo.
 */
export function checkGoalCollision(
  ball: Ball,
  goal: GoalDimensions
): 'goal' | 'post_left' | 'post_right' | 'crossbar' | 'miss' | null {
  // Kontrola, zda míček dorazil na úroveň brankové čáry Y
  if (ball.y > goal.y + 12 || ball.y < goal.y - 25) {
    return null;
  }

  const leftPostX = goal.x - goal.width / 2;
  const rightPostX = goal.x + goal.width / 2;
  const crossbarZ = goal.height;
  const tolerance = ball.radius + goal.postRadius;

  // Zásah levé tyčky
  if (Math.abs(ball.x - leftPostX) <= tolerance && ball.z <= crossbarZ + tolerance) {
    return 'post_left';
  }

  // Zásah pravé tyčky
  if (Math.abs(ball.x - rightPostX) <= tolerance && ball.z <= crossbarZ + tolerance) {
    return 'post_right';
  }

  // Zásah břevna
  if (ball.x > leftPostX && ball.x < rightPostX && Math.abs(ball.z - crossbarZ) <= tolerance) {
    return 'crossbar';
  }

  // V brance (mezi tyčemi a pod břevnem)
  if (ball.x > leftPostX + tolerance && ball.x < rightPostX - tolerance && ball.z >= 0 && ball.z < crossbarZ - 4) {
    return 'goal';
  }

  // Mimo branku
  return 'miss';
}

/**
 * Aktualizace fyzikálního stavu míčku pro jeden krok dt.
 */
export function updateBallPhysics(ball: Ball, dt: number, goalY: number): void {
  if (!ball.isMoving) return;

  // Aktualizace stop
  ball.trail.push({ x: ball.x, y: ball.y - ball.z, alpha: 0.8 });
  if (ball.trail.length > 14) {
    ball.trail.shift();
  }
  for (const t of ball.trail) {
    t.alpha -= dt * 2;
  }

  // Posun
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;

  // Gravitace ve výšce Z
  ball.vz -= 340 * dt;

  // Odraz od podlahy
  if (ball.z < 0) {
    ball.z = 0;
    if (Math.abs(ball.vz) > 40) {
      ball.vz = -ball.vz * 0.45; // tlumený odraz
    } else {
      ball.vz = 0;
    }
  }

  // Otáčení míčku
  ball.rotation += (ball.vx + ball.vy) * 0.015 * dt;

  // Mírné tření vzduchu
  ball.vx *= 0.995;
  ball.vy *= 0.995;

  // Zastavení při překročení branky nebo příliš nízké rychlosti
  if (ball.y < goalY - 60 || (Math.hypot(ball.vx, ball.vy) < 15 && ball.y < goalY + 80)) {
    ball.isMoving = false;
  }
}
