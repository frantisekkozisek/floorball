import { describe, it, expect } from 'vitest';
import { analyzeGesture, analyzeDrawnPath, checkGoalCollision, updateBallPhysics, partitionStroke, calculateShotVelocity } from '../src/game/physics';
import { GoalkeeperAI } from '../src/game/goalkeeper';
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

  describe('partitionStroke()', () => {
    it('vrátí výchozí hodnoty pro prázdné pole', () => {
      const res = partitionStroke([], goal);
      expect(res.runPath.length).toBe(1);
      expect(res.shotTarget).toBeDefined();
      expect(res.shotTarget.label).toContain('STŘELA');
    });

    it('rozdělí tah na trasu běhu (y >= 285) a cíl v levém vinklu', () => {
      const points = [
        { x: 270, y: 780 },
        { x: 230, y: 550 },
        { x: 200, y: 350 },
        { x: 190, y: 290 },
        { x: 180, y: 100 }, // cíl v levém vinklu (x vlevo, y vysoko v síti)
      ];
      const res = partitionStroke(points, goal);

      // Trasa běhu se zastaví na shooting line Y >= 285
      for (const p of res.runPath) {
        expect(p.y).toBeGreaterThanOrEqual(284.9);
      }
      expect(res.releasePoint.y).toBe(285);

      // Cíl v brance odpovídá levému vinklu
      expect(res.shotTarget.x).toBeLessThan(goal.x - 35);
      expect(res.shotTarget.z).toBeGreaterThan(80);
      expect(res.shotTarget.label).toBe('LEVÝ VINKL! ⭐');
    });

    it('rozdělí tah s cílem v pravém vinklu', () => {
      const points = [
        { x: 270, y: 780 },
        { x: 320, y: 500 },
        { x: 350, y: 320 },
        { x: 360, y: 100 }, // pravý horní roh
      ];
      const res = partitionStroke(points, goal);
      expect(res.shotTarget.x).toBeGreaterThan(goal.x + 35);
      expect(res.shotTarget.z).toBeGreaterThan(80);
      expect(res.shotTarget.label).toBe('PRAVÝ VINKL! ⭐');
    });

    it('detekuje střelu po zemi k tyči', () => {
      const points = [
        { x: 270, y: 780 },
        { x: 250, y: 400 },
        { x: 180, y: 210 }, // levý dolní roh (při zemi)
      ];
      const res = partitionStroke(points, goal);
      expect(res.shotTarget.x).toBeLessThan(goal.x - 35);
      expect(res.shotTarget.z).toBeLessThanOrEqual(40);
      expect(res.shotTarget.label).toContain('K LEVÉ TYČI');
    });

    it('promítne směr střely do branky, pokud tah skončí na palubovce', () => {
      const points = [
        { x: 270, y: 780 },
        { x: 270, y: 600 },
        { x: 270, y: 450 }, // končí před brankovištěm
      ];
      const res = partitionStroke(points, goal);
      expect(res.runPath.length).toBe(3);
      expect(res.releasePoint.y).toBe(450);
      expect(res.shotTarget.x).toBeCloseTo(270, 1);
      expect(res.shotTarget.z).toBeGreaterThan(0);
    });
  });

  describe('calculateShotVelocity()', () => {
    it('vypočítá balistické rychlosti tak, že míček přesně zasáhne cíl na brankové čáře', () => {
      const start = { x: 250, y: 350 };
      const target = { x: 320, y: 120, z: 100 }; // cíl s výškou z = 100
      const vel = calculateShotVelocity(start, target, goal.y, 760);

      expect(vel.flightTime).toBeGreaterThan(0.18);
      expect(vel.vy).toBeLessThan(0); // míček letí dopředu k brance

      // Simulace letu míčku:
      // x(t) = start.x + vx * t
      // y(t) = start.y + vy * t
      // z(t) = start.z + vz * t - 0.5 * 340 * t^2
      const t = vel.flightTime;
      const finalX = start.x + vel.vx * t;
      const finalY = start.y + vel.vy * t;
      const finalZ = vel.vz * t - 0.5 * 340 * t * t;

      expect(finalX).toBeCloseTo(target.x, 1);
      expect(finalY).toBeCloseTo(goal.y, 1);
      expect(finalZ).toBeCloseTo(target.z, 1);
    });
  });

  describe('GoalkeeperAI', () => {
    it('aktivně vykrývá úhel podle pozice hráče před střelou', () => {
      const ai = new GoalkeeperAI(goal);
      const ball: Ball = {
        x: 350, // hráč je na pravé straně hřiště
        y: 500,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: false,
        trail: [],
      };

      // Po několika krocích by se brankář měl posunout doprava
      for (let i = 0; i < 20; i++) {
        ai.update(0.016, ball);
      }

      expect(ai.goalie.x).toBeGreaterThan(goal.x);
    });

    it('bleskově skočí směrem k cíli střely', () => {
      const ai = new GoalkeeperAI(goal);
      const ball: Ball = {
        x: 270,
        y: 280,
        z: 20,
        vx: -300,
        vy: -600,
        vz: 100,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };

      ai.onShotInitiated('normal', 200); // střela vlevo k tyči
      expect(ai.goalie.targetX).toBe(200);

      // Po 0.08s by se měl výrazně pohnout doleva
      for (let i = 0; i < 6; i++) {
        ai.update(0.016, ball);
      }
      expect(ai.goalie.x).toBeLessThan(goal.x);
      expect(ai.goalie.state).toBe('save_left');
    });

    it('nechá se oklamat florbalovou stahovačkou (toe-drag)', () => {
      const ai = new GoalkeeperAI(goal);
      ai.onShotInitiated('toe-drag', 210); // střela míří doleva
      // Při toe-drag brankář skočí nejprve na opačnou stranu (doprava)
      expect(ai.goalie.targetX).toBeGreaterThan(goal.x);
    });

    it('chytí střelu doprostřed branky ve výšce těla', () => {
      const ai = new GoalkeeperAI(goal);
      const ball: Ball = {
        x: goal.x,
        y: ai.goalie.y + 5,
        z: 40, // výška těla v kleče
        vx: 0,
        vy: -600,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      expect(ai.checkSave(ball)).toBe(true);
    });

    it('pustí střelu vysoko do vinklu (z >= 85) i když míří kousek od těla', () => {
      const ai = new GoalkeeperAI(goal);
      const ball: Ball = {
        x: goal.x + 35, // roh / strana
        y: ai.goalie.y + 5,
        z: 95, // vinkl pod břevno
        vx: 0,
        vy: -600,
        vz: 0,
        radius: 12,
        rotation: 0,
        isMoving: true,
        trail: [],
      };
      // Klečící brankář na z = 95 nedosáhne
      expect(ai.checkSave(ball)).toBe(false);
    });

    describe('3 Úrovně obtížnosti brankáře (Junior, Profi, Legenda)', () => {
      it('správně cykluje mezi úrovněmi junior -> profi -> legend -> junior', () => {
        const ai = new GoalkeeperAI(goal, 'junior');
        expect(ai.level).toBe('junior');
        expect(ai.config.badge).toContain('Junior');

        expect(ai.getNextLevel()).toBe('profi');
        ai.setLevel('profi');
        expect(ai.level).toBe('profi');
        expect(ai.config.badge).toContain('Profi');

        expect(ai.getNextLevel()).toBe('legend');
        ai.setLevel('legend');
        expect(ai.level).toBe('legend');
        expect(ai.config.badge).toContain('Legenda');

        expect(ai.getNextLevel()).toBe('junior');
        ai.setLevel('junior');
        expect(ai.level).toBe('junior');
      });

      it('Junior pustí střelu, kterou Profi a Legenda chytí', () => {
        const juniorAi = new GoalkeeperAI(goal, 'junior');
        const profiAi = new GoalkeeperAI(goal, 'profi');
        const legendAi = new GoalkeeperAI(goal, 'legend');

        // Míček míří do vzdálenosti dx = 50 a výšky z = 64
        // Junior má sideReach=46 a maxHeightReach=60 -> nechytí
        // Profi má sideReach=56 a maxHeightReach=68 -> chytí
        // Legenda má sideReach=62 a maxHeightReach=74 -> chytí
        const ball: Ball = {
          x: goal.x + 50,
          y: juniorAi.goalie.y + 5,
          z: 64,
          vx: 0,
          vy: -600,
          vz: 0,
          radius: 12,
          rotation: 0,
          isMoving: true,
          trail: [],
        };

        expect(juniorAi.checkSave(ball)).toBe(false);
        expect(profiAi.checkSave(ball)).toBe(true);
        expect(legendAi.checkSave(ball)).toBe(true);
      });

      it('Profi pustí extrémní střelu k tyči, kterou chytí pouze Legenda (Zeď)', () => {
        const profiAi = new GoalkeeperAI(goal, 'profi');
        const legendAi = new GoalkeeperAI(goal, 'legend');

        // Míček míří do vzdálenosti dx = 60 a výšky z = 70
        // Profi: sideReach=56 -> nechytí
        // Legenda: sideReach=62, maxHeightReach=74 -> chytí
        const ball: Ball = {
          x: goal.x + 60,
          y: profiAi.goalie.y + 5,
          z: 70,
          vx: 0,
          vy: -600,
          vz: 0,
          radius: 12,
          rotation: 0,
          isMoving: true,
          trail: [],
        };

        expect(profiAi.checkSave(ball)).toBe(false);
        expect(legendAi.checkSave(ball)).toBe(true);
      });

      it('Junior se nechá oklamat stahovačkou na mnohem delší dobu než Legenda', () => {
        const juniorAi = new GoalkeeperAI(goal, 'junior');
        const legendAi = new GoalkeeperAI(goal, 'legend');

        expect(juniorAi.config.deceptionDelay).toBeGreaterThan(legendAi.config.deceptionDelay * 2.5);
        expect(juniorAi.config.reactionTime).toBeGreaterThan(legendAi.config.reactionTime * 5);
      });
    });
  });

  describe('GameEngine - Ochrana proti kreslení a střelbě během přechodu mezi nájezdy', () => {
    const createMockCanvas = () => {
      const listeners: Record<string, Function[]> = {};
      return {
        canvas: {
          getContext: () => ({
            clearRect: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            arc: () => {},
            stroke: () => {},
            fill: () => {},
            save: () => {},
            restore: () => {},
            translate: () => {},
            rotate: () => {},
            ellipse: () => {},
            roundRect: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            createRadialGradient: () => ({ addColorStop: () => {} }),
            setLineDash: () => {},
            fillText: () => {},
          }),
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }),
          style: {},
          width: 540,
          height: 960,
          addEventListener: (event: string, cb: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
          },
          removeEventListener: () => {},
        } as unknown as HTMLCanvasElement,
        listeners,
      };
    };

    it('neumožní kreslit trasu ani zahájit střelu, pokud běží časovač před dalším nájezdem (nextShotTimer > 0)', async () => {
      const { GameEngine } = await import('../src/game/gameEngine');
      const { canvas, listeners } = createMockCanvas();
      const engine = new GameEngine(canvas);

      // Simulujeme dokončení nájezdu (např. save), které nastaví nextShotTimer = 2.2
      // @ts-ignore
      engine.onShotResult('save');
      // @ts-ignore
      expect(engine.nextShotTimer).toBeGreaterThan(0);

      const pointerdownHandlers = listeners['pointerdown'] || [];
      expect(pointerdownHandlers.length).toBeGreaterThan(0);

      // Hráč se pokusí klepnout a táhnout po obrazovce během zobrazení banneru výsledku
      pointerdownHandlers[0]({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: 270,
        clientY: 700,
      });

      // Kreslení trasy musí zůstat zablokované (žádná nechtěná čára)
      expect(engine.isDrawingPath).toBe(false);
      expect(engine.drawnPath.length).toBe(0);
      expect(engine.shotTarget).toBeNull();
    });

    it('klepnutí na obrazovku během zobrazení banneru (nextShotTimer > 0) přeskočí čekání a zahájí další nájezd', async () => {
      const { GameEngine } = await import('../src/game/gameEngine');
      const { canvas } = createMockCanvas();
      const engine = new GameEngine(canvas);

      // @ts-ignore
      engine.onShotResult('goal');
      // @ts-ignore
      expect(engine.nextShotTimer).toBeGreaterThan(0);
      expect(engine.score.currentShot).toBe(1);

      // Klepnutí na canvas přeskočí zbývající čekání
      engine.handleClickAt(270, 500);

      // @ts-ignore
      expect(engine.nextShotTimer).toBe(0);
      expect(engine.score.currentShot).toBe(2);
      expect(engine.isDrawingPath).toBe(false);
    });
  });
});
