import { TouchPoint, TrickType, ShotParams, Ball, GoalDimensions } from './types';

/**
 * Analyzuje dotyková gesta a rozpoznává florbalové triky:
 * 1. 'zorro' - výrazně obloukový pohyb (flick po kružnici nahoru)
 * 2. 'toe-drag' (stahovačka) - pohyb nejdřív do strany / lehce vzad a pak prudký švih dopředu
 * 3. 'normal' - přímý švih na branku
 */
export function analyzeGesture(points: TouchPoint[]): ShotParams | null {
  if (!points || points.length < 2) return null;

  const start = points[0];
  const end = points[points.length - 1];
  const durationMs = Math.max(end.time - start.time, 16);

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // Střela musí směřovat nahoru směrem k brance (dy záporné)
  if (dy > -25) {
    return null; // Nedostatečný pohyb dopředu
  }

  const directDistance = Math.hypot(dx, dy);
  if (directDistance < 35) {
    return null; // Příliš krátké gesto
  }

  // Výpočet celkové délky projeté trasy
  let pathLength = 0;
  let maxSideDeviation = 0;
  let hasLateralHook = false;

  for (let i = 1; i < points.length; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    pathLength += Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);

    // Odchylka od přímé spojnice start -> end
    // Vzorec pro vzdálenost bodu od přímky
    const numerator = Math.abs(dy * pCurr.x - dx * pCurr.y + end.x * start.y - end.y * start.x);
    const deviation = numerator / directDistance;
    if (deviation > maxSideDeviation) {
      maxSideDeviation = deviation;
    }

    // Detekce stahovačky: v první polovině gesta výrazný pohyb v X při minimálním nebo zpětném posunu v Y
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
  } else if ((maxSideDeviation > 38 && pathLength / directDistance > 1.1) || maxSideDeviation > 50) {
    // Plynulý velký oblouk = zorro trik
    type = 'zorro';
    curve = (dx > 0 ? 1 : -1) * 0.8;
    lift = 0.95; // Zorro zvedá míček pod břevno
  } else if (maxSideDeviation > 25 && pathLength / directDistance > 1.12) {
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
