import { describe, it, expect } from 'vitest';
import { analyzeGesture, analyzeDrawnPath, checkGoalCollision, updateBallPhysics } from '../src/game/physics';
import { TouchPoint, Ball, GoalDimensions } from '../src/game/types';

describe('Florbalová fyzika & Detekce triků', () => {
  const goal: GoalDimensions = {
    x: 270,
    y: 220,
    width: 230,
    height: 140,
    postRadius: 7,
  };

  describe('analyzeGesture()', () => {
    it('vrátí null pro prázdné nebo příliš krátké body', () => {
      expect(analyzeGesture([])).toBeNull();
      expect(analyzeGesture([{ x: 270, y: 700, time: 100 }])).toBeNull();
    });

    it('vrátí null pro tah směrem dozadu (od branky)', () => {
      const backwardSwipe: TouchPoint[] = [
        { x: 270, y: 700, time: 100 },
        { x: 270, y: 750, time: 200 },
      ];
      expect(analyzeGesture(backwardSwipe)).toBeNull();
    });

    it('rozpozná přímý švih jako normální střelu', () => {
      const straightShot: TouchPoint[] = [
        { x: 270, y: 740, time: 100 },
        { x: 270, y: 600, time: 150 },
        { x: 270, y: 400, time: 200 },
        { x: 270, y: 220, time: 250 },
      ];
      const result = analyzeGesture(straightShot);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('normal');
      expect(result?.speed).toBeGreaterThan(400);
    });

    it('rozpozná florbalovou stahovačku (toe-drag)', () => {
      const toeDrag: TouchPoint[] = [
        { x: 270, y: 740, time: 100 },
        { x: 320, y: 735, time: 130 }, // rychlý úkrok do strany
        { x: 335, y: 730, time: 160 },
        { x: 280, y: 500, time: 210 }, // vystřelení k tyči
        { x: 250, y: 220, time: 260 },
      ];
      const result = analyzeGesture(toeDrag);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('toe-drag');
    });

    it('rozpozná florbalový zorro trik (oblouk ve vzduchu)', () => {
      const zorro: TouchPoint[] = [
        { x: 270, y: 740, time: 100 },
        { x: 190, y: 640, time: 150 }, // velký boční oblouk
        { x: 180, y: 480, time: 200 },
        { x: 240, y: 320, time: 250 },
        { x: 320, y: 220, time: 300 }, // zakončení do šibenice
      ];
      const result = analyzeGesture(zorro);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('zorro');
      expect(result?.lift).toBeGreaterThan(0.8);
    });
  });

  describe('analyzeDrawnPath()', () => {
    it('vyhodnotí přímou trasu jako normal', () => {
      const path = [
        { x: 270, y: 780 },
        { x: 270, y: 600 },
        { x: 270, y: 400 },
        { x: 270, y: 250 },
      ];
      expect(analyzeDrawnPath(path)).toBe('normal');
    });

    it('vyhodnotí trasu se stahovačkou jako toe-drag', () => {
      const path = [
        { x: 270, y: 780 },
        { x: 340, y: 760 }, // ostrý zásek do strany
        { x: 250, y: 450 },
        { x: 250, y: 250 },
      ];
      expect(analyzeDrawnPath(path)).toBe('toe-drag');
    });

    it('vyhodnotí obloukovou trasu jako zorro', () => {
      const path = [
        { x: 270, y: 780 },
        { x: 180, y: 650 },
        { x: 160, y: 450 },
        { x: 230, y: 320 },
        { x: 300, y: 240 },
      ];
      expect(analyzeDrawnPath(path)).toBe('zorro');
    });
  });


  describe('checkGoalCollision()', () => {
    it('detekuje regulérní gól do sítě', () => {
      const ball: Ball = {
        x: 270,
        y: 220,
        z: 40,
        vx: 0,
        vy: -500,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(checkGoalCollision(ball, goal)).toBe('goal');
    });

    it('detekuje náraz do levé tyčky', () => {
      const leftPostX = goal.x - goal.width / 2;
      const ball: Ball = {
        x: leftPostX,
        y: 220,
        z: 30,
        vx: 0,
        vy: -500,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(checkGoalCollision(ball, goal)).toBe('post_left');
    });

    it('detekuje náraz do pravé tyčky', () => {
      const rightPostX = goal.x + goal.width / 2;
      const ball: Ball = {
        x: rightPostX,
        y: 220,
        z: 30,
        vx: 0,
        vy: -500,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(checkGoalCollision(ball, goal)).toBe('post_right');
    });

    it('detekuje břevno', () => {
      const ball: Ball = {
        x: 270,
        y: 220,
        z: goal.height, // ve výšce břevna
        vx: 0,
        vy: -500,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(checkGoalCollision(ball, goal)).toBe('crossbar');
    });

    it('detekuje střelu mimo branku', () => {
      const ball: Ball = {
        x: 450, // daleko vpravo od branky
        y: 220,
        z: 30,
        vx: 0,
        vy: -500,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(checkGoalCollision(ball, goal)).toBe('miss');
    });
  });

  describe('updateBallPhysics()', () => {
    it('aktualizuje pozici a trajektorii míčku', () => {
      const ball: Ball = {
        x: 270,
        y: 600,
        z: 50,
        vx: 100,
        vy: -200,
        vz: 50,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };

      updateBallPhysics(ball, 0.1, goal.y);
      expect(ball.x).toBeGreaterThan(270);
      expect(ball.y).toBeLessThan(600);
      expect(ball.trail.length).toBeGreaterThan(0);
    });
  });
});
