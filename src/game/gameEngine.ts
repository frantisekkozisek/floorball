import { Ball, GameScore, GameMode, GoalDimensions, TouchPoint, TrickType, ShotTarget, GoalieLevel, GoalieConfig, PlayerConfig, LeaderboardEntry } from './types';
import { analyzeGesture, analyzeDrawnPath, checkGoalCollision, updateBallPhysics, partitionStroke, calculateShotVelocity, getGoalTargetPockets, AIM_OFFSET_Y, AIMING_ZONE_Y } from './physics';
import { GoalkeeperAI } from './goalkeeper';
import { ParticleSystem } from './particles';
import { TutorialManager } from './tutorial';
import { soundManager } from '../audio/soundEffects';
import { loadPlayerConfig, savePlayerConfig, loadLeaderboard, addLeaderboardScore, calculateShotScore, getPlayerTitle } from './scoring';

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Virtuální rozlišení (optimalizováno na 9:16 mobilní displej)
  public readonly V_WIDTH = 540;
  public readonly V_HEIGHT = 960;

  private goal: GoalDimensions;
  private ball: Ball;
  private goalieAI: GoalkeeperAI;
  private particles: ParticleSystem;
  public tutorial: TutorialManager;

  // Konfigurace hráče (jméno, číslo, barva dresu) a Síň slávy
  public playerConfig: PlayerConfig = loadPlayerConfig();
  public leaderboard: LeaderboardEntry[] = loadLeaderboard();
  public lastLeaderboardRank: number | null = null;
  public onOpenPlayerModal?: () => void;

  public mode: GameMode = 'shootout';
  public score: GameScore = {
    shotsTotal: 0,
    goals: 0,
    saves: 0,
    posts: 0,
    currentShot: 1,
    maxShots: 5,
    points: 0,
    combo: 0,
    lastShotPoints: 0,
    history: [],
  };

  private strokeStartTime: number = 0;
  private lastShotTrickType: TrickType = 'normal';
  private lastShotTargetLabel: string = 'Gól do sítě';
  private lastShotDuration: number = 1.5;

  // Kreslení trasy a běh hráčky po hřišti (Varianta 1)
  public drawnPath: { x: number; y: number }[] = [];
  public rawDrawnPoints: { x: number; y: number }[] = [];
  public shotTarget: ShotTarget | null = null;
  public releasePoint: { x: number; y: number } | null = null;
  public isDrawingPath: boolean = false;
  public isRunningPath: boolean = false;
  private pathSegmentIndex: number = 0;
  private pathSegmentProgress: number = 0;
  private runTimer: number = 0;
  private playerFacingAngle: number = 0;

  // Vstupní dotykové body
  private touchPoints: TouchPoint[] = [];
  private isPointerDown: boolean = false;

  // Stavy zprávy
  private bannerText: string = '';
  private bannerSubtext: string = '';
  private bannerTimer: number = 0;
  private bannerColor: string = '#ffe600';

  // Animace hráčky a hole
  private stickAngle: number = -0.35;
  private stickTargetAngle: number = -0.35;
  private playerX: number = 270;
  private playerY: number = 780;

  // Časovač dalšího nájezdu
  private nextShotTimer: number = 0;


  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Nelze vytvořit 2D canvas kontext');
    this.ctx = context;

    this.goal = {
      x: this.V_WIDTH / 2,
      y: 220,
      width: 230,
      height: 140,
      postRadius: 7,
    };

    this.ball = this.createInitialBall();
    this.goalieAI = new GoalkeeperAI(this.goal);
    this.particles = new ParticleSystem();
    this.tutorial = new TutorialManager(this.V_WIDTH, this.V_HEIGHT);

    this.setupListeners();
    this.resize();
    this.startShootout();
  }

  private createInitialBall(): Ball {
    return {
      x: this.V_WIDTH / 2 + 15,
      y: 740,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 12,
      rotation: 0,
      isMoving: false,
      trail: [],
    };
  }

  private resetBall() {
    this.playerX = 270;
    this.playerY = 780;
    this.playerFacingAngle = 0;
    this.rawDrawnPoints = [];
    this.drawnPath = [];
    this.shotTarget = null;
    this.releasePoint = null;
    this.isDrawingPath = false;
    this.isRunningPath = false;
    this.pathSegmentIndex = 0;
    this.pathSegmentProgress = 0;
    this.runTimer = 0;
    this.ball = this.createInitialBall();
    this.stickAngle = -0.35;
    this.stickTargetAngle = -0.35;
    this.goalieAI.reset();
  }

  public setPlayerConfig(config: Partial<PlayerConfig>) {
    this.playerConfig = {
      name: (config.name || this.playerConfig.name || 'JULINKA').trim().slice(0, 12).toUpperCase(),
      number: Math.max(1, Math.min(99, Number(config.number) || 7)),
      jerseyColor: config.jerseyColor || this.playerConfig.jerseyColor || '#ec4899',
    };
    savePlayerConfig(this.playerConfig);
  }

  public getPlayerConfig(): PlayerConfig {
    return this.playerConfig;
  }

  public startShootout() {
    this.mode = 'shootout';
    this.score = {
      shotsTotal: 0,
      goals: 0,
      saves: 0,
      posts: 0,
      currentShot: 1,
      maxShots: 5,
      points: 0,
      combo: 0,
      lastShotPoints: 0,
      history: [],
    };
    this.lastLeaderboardRank = null;
    this.resetBall();
    this.showBanner('1. NÁJEZD!', 'Nakresli prstem trasu k brance!', '#00ffcc', 1.8);
    soundManager.playWhistle();
  }

  public cycleGoalieLevel(): GoalieLevel {
    const nextLevel = this.goalieAI.getNextLevel();
    this.goalieAI.setLevel(nextLevel);
    this.showBanner(
      `BRANKÁŘ: ${this.goalieAI.config.badge}`,
      `Obtížnost: ${this.goalieAI.config.name}`,
      '#ffe600',
      1.8
    );
    soundManager.playLevelUp();
    return nextLevel;
  }

  public getGoalieLevel(): GoalieLevel {
    return this.goalieAI.level;
  }

  public getGoalieConfig(): GoalieConfig {
    return this.goalieAI.config;
  }

  public startTutorial() {
    this.mode = 'tutorial';
    this.tutorial.reset();
    this.resetBall();
  }

  private lastDribbleSoundTime: number = 0;

  private setupListeners() {
    const getPos = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.V_WIDTH / (rect.width || 1);
      const scaleY = this.V_HEIGHT / (rect.height || 1);
      return {
        x: Math.max(0, Math.min(this.V_WIDTH, (clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(this.V_HEIGHT, (clientY - rect.top) * scaleY)),
      };
    };

    const onStart = (pos: { x: number; y: number }) => {
      soundManager.ensureAudio();

      // Pokud je hra ukončena (GameOver), jakýkoliv dotyk okamžitě spustí novou hru!
      if (this.mode === 'gameover') {
        this.isPointerDown = false;
        this.isDrawingPath = false;
        // Kliknutí na tlačítko "UPRAVIT HRÁČE" (y: 660 - 720)
        if (pos.y >= 660 && pos.y <= 720 && pos.x >= this.V_WIDTH / 2 - 140 && pos.x <= this.V_WIDTH / 2 + 140) {
          this.onOpenPlayerModal?.();
          return;
        }
        // Kliknutí na "HRÁT ZNOVU" nebo kdekoliv jinde
        this.startShootout();
        return;
      }

      // Pokud běží časovač před dalším nájezdem (zobrazuje se výsledek předchozí střely),
      // klepnutím na obrazovku okamžitě přeskočíme čekání a zahájíme další nájezd bez kreslení!
      if (this.nextShotTimer > 0) {
        this.nextShotTimer = 0;
        if (this.mode === 'shootout') {
          this.advanceShootout();
        } else {
          this.resetBall();
        }
        this.isPointerDown = false;
        this.isDrawingPath = false;
        this.rawDrawnPoints = [];
        this.drawnPath = [];
        this.shotTarget = null;
        this.releasePoint = null;
        return;
      }

      // Zkontrolujeme, zda uživatel nekliknul na tlačítko "Přeskočit trénink / Jít na nájezdy"
      if (this.mode === 'tutorial') {
        if (pos.x >= this.V_WIDTH / 2 - 140 && pos.x <= this.V_WIDTH / 2 + 140 && pos.y >= 840 && pos.y <= 920) {
          this.startShootout();
          this.isPointerDown = false;
          return;
        }
      }

      this.isPointerDown = true;
      this.strokeStartTime = performance.now();
      this.touchPoints = [{ x: pos.x, y: pos.y, time: performance.now() }];

      // Začátek kreslení trasy pro Julinku (POUZE když míček neletí, Julinka neběží a nečeká se na další nájezd)
      if (!this.ball.isMoving && !this.isRunningPath && this.nextShotTimer <= 0) {
        this.isDrawingPath = true;
        // Pokud prst položíme přímo do zóny branky (y <= AIMING_ZONE_Y + 40), jde o přímé míření na branku bez náběhu
        if (pos.y <= AIMING_ZONE_Y + 40) {
          this.rawDrawnPoints = [{ x: pos.x, y: pos.y }];
        } else {
          // Trasa začíná u nohou Julinky a pokračuje k prstu
          this.rawDrawnPoints = [
            { x: this.playerX, y: this.playerY },
            { x: pos.x, y: pos.y },
          ];
        }
        this.updatePartitionedStroke();
      }
    };

    const onMove = (pos: { x: number; y: number }) => {
      if (!this.isPointerDown || this.nextShotTimer > 0) return;
      const now = performance.now();
      this.touchPoints.push({ x: pos.x, y: pos.y, time: now });

      if (this.isDrawingPath && !this.ball.isMoving && !this.isRunningPath && this.nextShotTimer <= 0) {
        // Přidáme bod do trasy pokud se prst posunul aspoň o 6px
        const last = this.rawDrawnPoints[this.rawDrawnPoints.length - 1];
        if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 6) {
          this.rawDrawnPoints.push({ x: pos.x, y: pos.y });
          this.updatePartitionedStroke();

          // Tichý zvuk vedení míčku při kreslení po palubovce
          if (pos.y > AIMING_ZONE_Y && now - this.lastDribbleSoundTime > 220) {
            soundManager.playStickHit();
            this.lastDribbleSoundTime = now;
          }
        }
      }
    };

    const onEnd = (pos: { x: number; y: number }) => {
      if (this.mode === 'gameover') {
        this.isPointerDown = false;
        this.isDrawingPath = false;
        this.startShootout();
        return;
      }

      if (this.nextShotTimer > 0) {
        this.isPointerDown = false;
        this.isDrawingPath = false;
        return;
      }

      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.touchPoints.push({ x: pos.x, y: pos.y, time: performance.now() });

      if (this.isDrawingPath && !this.ball.isMoving && !this.isRunningPath && this.nextShotTimer <= 0) {
        this.isDrawingPath = false;
        this.rawDrawnPoints.push({ x: pos.x, y: pos.y });
        this.updatePartitionedStroke();

        let totalLength = 0;
        for (let i = 1; i < this.drawnPath.length; i++) {
          totalLength += Math.hypot(this.drawnPath[i].x - this.drawnPath[i - 1].x, this.drawnPath[i].y - this.drawnPath[i - 1].y);
        }

        // Pokud je nakreslená reálná trasa běhu po palubovce (> 35px), Julinka se po ní rozběhne!
        if (totalLength > 35 && this.drawnPath.length >= 2) {
          this.isRunningPath = true;
          this.pathSegmentIndex = 0;
          this.pathSegmentProgress = 0;
          this.runTimer = 0;
        } else {
          // Přímá střela bez běhu (nebo přímé zamíření do vybrané kapsy)
          this.drawnPath = [];
          this.attemptShot(this.releasePoint || { x: this.playerX, y: this.playerY });
        }
      }
      this.touchPoints = [];
    };

    // Moderní Pointer Events pro mobil i desktop (s pointer capture)
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignorovat pokud není podporováno
      }
      onStart(getPos(e.clientX, e.clientY));
    });

    this.canvas.addEventListener('pointermove', (e) => {
      e.preventDefault();
      onMove(getPos(e.clientX, e.clientY));
    });

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault();
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignorovat
      }
      onEnd(getPos(e.clientX, e.clientY));
    };

    this.canvas.addEventListener('pointerup', handlePointerUp);
    this.canvas.addEventListener('pointercancel', handlePointerUp);

    // Fallback dotykové události
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        onStart(getPos(e.touches[0].clientX, e.touches[0].clientY));
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        onMove(getPos(e.touches[0].clientX, e.touches[0].clientY));
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.changedTouches.length > 0) {
        onEnd(getPos(e.changedTouches[0].clientX, e.changedTouches[0].clientY));
      } else {
        onEnd({ x: this.ball.x, y: this.ball.y });
      }
    }, { passive: false });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => {
        setTimeout(() => this.resize(), 100);
      });
    }
  }

  public resize() {
    if (typeof window === 'undefined') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = this.V_WIDTH / this.V_HEIGHT;

    let targetW = w;
    let targetH = w / aspect;

    if (targetH > h) {
      targetH = h;
      targetW = h * aspect;
    }

    this.canvas.style.width = `${Math.floor(targetW)}px`;
    this.canvas.style.height = `${Math.floor(targetH)}px`;
    this.canvas.width = this.V_WIDTH;
    this.canvas.height = this.V_HEIGHT;
  }

  private updatePartitionedStroke() {
    const prevLabel = this.shotTarget?.label;
    const partitioned = partitionStroke(
      this.rawDrawnPoints,
      this.goal,
      this.shotTarget,
      { x: this.playerX, y: this.playerY }
    );
    this.drawnPath = partitioned.runPath;
    this.shotTarget = partitioned.shotTarget;
    this.releasePoint = partitioned.releasePoint;

    // Pokud došlo k uzamčení nové magnetické kapsy, přehrajeme uspokojivý zvukový klik
    if (this.shotTarget && this.shotTarget.label !== prevLabel) {
      soundManager.playAimSnap();
    }
  }

  private attemptShot(releasePos?: { x: number; y: number }) {
    if (this.nextShotTimer > 0 || this.ball.isMoving || this.isRunningPath) return;

    let shot = analyzeGesture(this.touchPoints);

    // Pokud uživatel táhl a uvolnil prst bez prudkého švihu, vytvoříme přímou střelu na branku
    if (!shot) {
      const aimX = releasePos ? releasePos.x : this.ball.x;
      const targetGoalX = Math.max(
        this.goal.x - this.goal.width * 0.44,
        Math.min(this.goal.x + this.goal.width * 0.44, aimX)
      );

      shot = {
        type: 'normal',
        startX: this.ball.x,
        startY: this.ball.y,
        targetX: targetGoalX,
        targetY: this.goal.y,
        speed: 680,
        curve: 0,
        lift: 0.5,
      };
    }

    this.lastShotTrickType = shot.type;
    this.lastShotTargetLabel = this.shotTarget ? this.shotTarget.label : (shot.type === 'toe-drag' ? '⚡ K TYČI!' : (shot.type === 'zorro' ? '⭐ VINKL!' : 'Gól do sítě'));
    this.lastShotDuration = Math.max(0.5, (performance.now() - (this.strokeStartTime || performance.now())) / 1000);

    soundManager.playStickHit();
    this.stickAngle = 0.6; // prudký švih hokejkou

    let targetX = shot.targetX;
    let targetY = shot.targetY;
    let targetZ = shot.lift * 130;

    // Striktní priorita zaměřeného terče v brance (hráčův cíl se nikdy nepřepíše!)
    if (this.shotTarget) {
      targetX = this.shotTarget.x;
      targetY = this.shotTarget.y;
      targetZ = this.shotTarget.z;
    }

    const shotVel = calculateShotVelocity(
      { x: this.ball.x, y: this.ball.y },
      { x: targetX, y: targetY, z: targetZ },
      this.goal.y,
      shot.speed
    );

    this.ball.vx = shotVel.vx;
    this.ball.vy = shotVel.vy;
    this.ball.vz = shotVel.vz;
    this.ball.isMoving = true;

    if (shot.type === 'zorro') {
      soundManager.playWhoosh();
    }

    this.goalieAI.onShotInitiated(shot.type, targetX);

    // Zpracování v tutoriálu
    if (this.mode === 'tutorial') {
      this.handleTutorialShot(shot.type);
    }
  }

  private handleTutorialShot(trick: TrickType) {
    const step = this.tutorial.getCurrentStep();
    if (!step) return;

    if (this.tutorial.checkTrickSuccess(trick)) {
      soundManager.playGoalHorn();
      this.particles.spawnGoalConfetti(this.V_WIDTH / 2, this.V_HEIGHT / 2, 40);

      let msg = 'SKVĚLÁ PRÁCE!';
      if (trick === 'zorro') msg = 'PARÁDNÍ ZORRO TRIK! ⭐';
      else if (trick === 'toe-drag') msg = 'SKVĚLÁ STAHOVAČKA! 🔥';
      else msg = 'SUPER STŘELA! 🎯';

      this.showBanner(msg, 'Krok splněn!', '#00ffcc', 2.0);
    } else {
      this.showBanner('Zkuste to znovu', `Pro tento krok potřebuješ: ${step.subtitle}`, '#ff2a6d', 1.8);
    }
  }

  private showBanner(title: string, subtitle: string, color: string, durationSec: number) {
    this.bannerText = title;
    this.bannerSubtext = subtitle;
    this.bannerColor = color;
    this.bannerTimer = durationSec;
  }

  private triggerShotFromRun() {
    const trickType = analyzeDrawnPath(this.rawDrawnPoints.length > 0 ? this.rawDrawnPoints : this.drawnPath);
    this.lastShotTrickType = trickType;
    this.lastShotTargetLabel = this.shotTarget ? this.shotTarget.label : (trickType === 'toe-drag' ? '⚡ K TYČI!' : (trickType === 'zorro' ? '⭐ VINKL!' : 'Gól do sítě'));
    this.lastShotDuration = Math.max(0.5, (performance.now() - (this.strokeStartTime || performance.now())) / 1000);

    soundManager.playStickHit();
    this.stickAngle = 0.7; // plný švih hokejkou

    let targetX = this.playerX;
    let targetY = this.goal.y - 70;
    let targetZ = 70;

    if (this.shotTarget) {
      targetX = this.shotTarget.x;
      targetY = this.shotTarget.y;
      targetZ = this.shotTarget.z;
    } else {
      if (trickType === 'toe-drag') {
        targetX = this.goal.x + (this.playerX > this.goal.x ? -65 : 65);
        targetZ = 20;
      } else if (trickType === 'zorro') {
        targetX = this.goal.x + (this.playerX > this.goal.x ? -75 : 75);
        targetZ = 115;
      } else {
        targetX = Math.max(
          this.goal.x - this.goal.width * 0.42,
          Math.min(this.goal.x + this.goal.width * 0.42, this.playerX)
        );
        targetZ = 65;
      }
      targetY = this.goal.y - targetZ;
    }

    const shotVel = calculateShotVelocity(
      { x: this.ball.x, y: this.ball.y },
      { x: targetX, y: targetY, z: targetZ },
      this.goal.y,
      760
    );

    this.ball.vx = shotVel.vx;
    this.ball.vy = shotVel.vy;
    this.ball.vz = shotVel.vz;
    this.ball.isMoving = true;

    if (trickType === 'zorro') {
      soundManager.playWhoosh();
    }

    this.goalieAI.onShotInitiated(trickType, targetX);

    if (this.mode === 'tutorial') {
      this.handleTutorialShot(trickType);
    }
  }

  public update(dt: number) {
    this.particles.update(dt);
    this.tutorial.update(dt);
    this.goalieAI.update(dt, this.ball);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
    }

    // Plynulý návrat hokejky
    this.stickAngle += (this.stickTargetAngle - this.stickAngle) * 12 * dt;

    // 1. Zpracování běhu Julinky po nakreslené trase
    if (this.isRunningPath && this.drawnPath.length >= 2) {
      this.runTimer += dt;
      const runSpeed = 460; // px/s rychlý sprint Julinky

      const pA = this.drawnPath[this.pathSegmentIndex];
      const pB = this.drawnPath[this.pathSegmentIndex + 1];
      const segDist = Math.hypot(pB.x - pA.x, pB.y - pA.y);

      if (segDist < 1) {
        this.pathSegmentIndex++;
      } else {
        this.pathSegmentProgress += (runSpeed * dt) / segDist;
        while (this.pathSegmentProgress >= 1 && this.pathSegmentIndex < this.drawnPath.length - 1) {
          this.pathSegmentProgress -= 1;
          this.pathSegmentIndex++;
        }
      }

      if (this.pathSegmentIndex >= this.drawnPath.length - 1) {
        // Julinka doběhla na konec nakreslené trasy -> Odpal na branku!
        this.isRunningPath = false;
        this.triggerShotFromRun();
      } else {
        const currA = this.drawnPath[this.pathSegmentIndex];
        const currB = this.drawnPath[this.pathSegmentIndex + 1];
        const t = Math.min(1, Math.max(0, this.pathSegmentProgress));

        this.playerX = currA.x + (currB.x - currA.x) * t;
        this.playerY = currA.y + (currB.y - currA.y) * t;

        const dx = currB.x - currA.x;
        const dy = currB.y - currA.y;
        const dist = Math.max(Math.hypot(dx, dy), 1);
        const dirX = dx / dist;
        const dirY = dy / dist;

        // Natočení Julinky do směru běhu
        this.playerFacingAngle = Math.atan2(dy, dx) - Math.PI / 2;

        // Míček běží těsně před čepelí florbalky
        this.ball.x = this.playerX + dirX * 22;
        this.ball.y = this.playerY + dirY * 22;
        this.ball.rotation += 22 * dt;

        // Kmitání hokejky
        this.stickAngle = -0.35 + Math.sin(this.runTimer * 20) * 0.25;

        // Zvuk klepnutí čepele
        const now = performance.now();
        if (now - this.lastDribbleSoundTime > 200) {
          soundManager.playStickHit();
          this.lastDribbleSoundTime = now;
        }
      }
    }

    if (this.ball.isMoving) {
      updateBallPhysics(this.ball, dt, this.goal.y);

      // 1. Kontrola zákroku brankáře
      if (this.goalieAI.checkSave(this.ball)) {
        this.ball.isMoving = false;
        soundManager.playSave();
        this.onShotResult('save');
      } else {
        // 2. Kontrola branky a tyček
        const col = checkGoalCollision(this.ball, this.goal);
        if (col === 'goal') {
          this.ball.isMoving = false;
          soundManager.playGoalHorn();
          this.particles.spawnGoalConfetti(this.ball.x, this.goal.y + 20, 70);
          this.onShotResult('goal');
        } else if (col === 'post_left' || col === 'post_right' || col === 'crossbar') {
          this.ball.isMoving = false;
          soundManager.playPostHit();
          this.particles.spawnPostSparks(this.ball.x, this.ball.y, 25);
          this.onShotResult('post');
        } else if (col === 'miss') {
          this.ball.isMoving = false;
          this.onShotResult('miss');
        }
      }
    }

    // Časovač pro přechod na další nájezd
    if (this.nextShotTimer > 0) {
      this.nextShotTimer -= dt;
      if (this.nextShotTimer <= 0) {
        if (this.mode === 'shootout') {
          this.advanceShootout();
        } else {
          this.resetBall();
        }
      }
    }
  }

  private onShotResult(result: 'goal' | 'save' | 'post' | 'miss') {
    this.isDrawingPath = false;
    this.isRunningPath = false;
    this.rawDrawnPoints = [];
    this.drawnPath = [];
    this.shotTarget = null;
    this.releasePoint = null;

    if (this.mode === 'shootout') {
      if (result === 'goal') {
        this.score.goals++;
        const breakdown = calculateShotScore({
          targetLabel: this.lastShotTargetLabel,
          trickType: this.lastShotTrickType,
          durationSeconds: this.lastShotDuration,
          comboStreak: this.score.combo,
          goalieLevel: this.goalieAI.config.id,
        });
        this.score.points += breakdown.totalPoints;
        this.score.lastShotPoints = breakdown.totalPoints;
        this.score.combo++;
        this.score.history.push(breakdown);

        const comboTxt = this.score.combo > 1 ? ` 🔥 ${this.score.combo}x KOMBO!` : '';
        this.showBanner(
          `GÓÓÓL! +${breakdown.totalPoints.toLocaleString('cs-CZ')} b.`,
          `${breakdown.shotDescription}${comboTxt}`,
          '#ffe600',
          2.2
        );
      } else if (result === 'post') {
        this.score.posts++;
        this.score.combo = 0;
        this.showBanner('CINK! TYČKA!', 'Chyběl jen kousíček!', '#05d9e8', 2.0);
      } else if (result === 'save') {
        this.score.saves++;
        this.score.combo = 0;
        this.showBanner('CHYCENO!', 'Brankář se vytáhl!', '#ff2a6d', 2.0);
      } else {
        this.score.combo = 0;
        this.showBanner('VEDLE!', 'Zamiř lépe do branky!', '#ff2a6d', 2.0);
      }
      this.nextShotTimer = 2.2;
    } else {
      this.nextShotTimer = 1.4;
    }
  }

  private advanceShootout() {
    this.score.shotsTotal++;
    if (this.score.currentShot >= this.score.maxShots) {
      this.mode = 'gameover';
      soundManager.playCheer();
      this.particles.spawnGoalConfetti(this.V_WIDTH / 2, this.V_HEIGHT / 3, 100);

      // Zápis do Síně slávy (TOP 3)
      const res = addLeaderboardScore({
        name: this.playerConfig.name,
        number: this.playerConfig.number,
        jerseyColor: this.playerConfig.jerseyColor,
        score: this.score.points,
        goals: this.score.goals,
        maxShots: this.score.maxShots,
        goalieLevel: this.goalieAI.config.id,
      });
      this.lastLeaderboardRank = res.newRank;
      this.leaderboard = res.leaderboard;
    } else {
      this.score.currentShot++;
      this.resetBall();
      this.showBanner(`${this.score.currentShot}. NÁJEZD`, 'Připrav se na střelu!', '#00ffcc', 1.4);
      soundManager.playWhistle();
    }
  }

  public render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.V_WIDTH, this.V_HEIGHT);

    this.drawCourt(ctx);
    this.drawGoal(ctx);
    this.drawGoalkeeper(ctx);
    this.drawDrawnPath(ctx); // Vykreslení trasy běhu Julinky
    this.drawPlayer(ctx);
    this.drawBall(ctx);
    this.particles.draw(ctx);

    if (this.mode === 'tutorial') {
      this.tutorial.drawGuide(ctx);
    }

    this.drawHUD(ctx);
    this.drawBanner(ctx);

    if (this.mode === 'gameover') {
      this.drawGameOverOverlay(ctx);
    }
  }

  /**
   * Vykreslení trasy běhu a zaměřovacího terče v brance (Varianta 1)
   */
  private drawDrawnPath(ctx: CanvasRenderingContext2D) {
    if (this.nextShotTimer > 0) return;
    if (this.drawnPath.length < 2 && !this.shotTarget) return;

    ctx.save();
    const startIdx = this.isRunningPath ? Math.max(0, this.pathSegmentIndex) : 0;
    const hasPointsToRun = startIdx < this.drawnPath.length - 1;

    // 1. Široká svítící trasa běhu po palubovce
    if (this.drawnPath.length >= 2 && (this.isDrawingPath || this.isRunningPath || hasPointsToRun)) {
      ctx.beginPath();
      ctx.moveTo(this.drawnPath[startIdx].x, this.drawnPath[startIdx].y);
      for (let i = startIdx + 1; i < this.drawnPath.length; i++) {
        ctx.lineTo(this.drawnPath[i].x, this.drawnPath[i].y);
      }
      ctx.strokeStyle = 'rgba(5, 217, 232, 0.4)';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Vnitřní neonově žlutá linie s animovaným dash
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 5;
      ctx.setLineDash([12, 8]);
      ctx.lineDashOffset = -performance.now() * 0.05;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Bod odpalu na konci běžecké trasy (pouze při náběhu)
    const launchPos = this.releasePoint || (this.drawnPath.length > 0 ? this.drawnPath[this.drawnPath.length - 1] : { x: this.playerX, y: this.playerY });

    if ((this.isDrawingPath || this.isRunningPath) && this.drawnPath.length >= 2) {
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.arc(launchPos.x, launchPos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 2b. Jemné virtuální mířidlo nad prstem hráče (odkrývá výhled na síť a kapsy)
    const fingerPos = this.rawDrawnPoints.length > 0 ? this.rawDrawnPoints[this.rawDrawnPoints.length - 1] : null;
    if (this.isDrawingPath && fingerPos && fingerPos.y < AIMING_ZONE_Y + 70) {
      const sightY = fingerPos.y - AIM_OFFSET_Y;
      // Spojovací čárkovaná linie od prstu nahoru k mířidlu
      ctx.beginPath();
      ctx.moveTo(fingerPos.x, fingerPos.y);
      ctx.lineTo(fingerPos.x, sightY);
      ctx.strokeStyle = 'rgba(255, 230, 0, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Malý zaměřovací terčík přímo v bodě mířidla
      ctx.beginPath();
      ctx.arc(fingerPos.x, sightY, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(fingerPos.x, sightY, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ff2a6d';
      ctx.fill();
    }

    // 3. Zaměřovací paprsek a cílový terč v brance
    if (this.shotTarget && (this.isDrawingPath || this.isRunningPath || this.ball.isMoving)) {
      const target = this.shotTarget;

      // Paprsek od hráčky do branky
      ctx.beginPath();
      ctx.moveTo(launchPos.x, launchPos.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = 'rgba(255, 42, 109, 0.35)';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(launchPos.x, launchPos.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = target.badgeColor || '#05d9e8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -performance.now() * 0.06;
      ctx.stroke();
      ctx.setLineDash([]);

      // 4. Interaktivní terč 🎯 v brance
      const pulse = Math.sin(performance.now() * 0.008) * 3;
      const rOuter = 20 + pulse;
      const rInner = 8;

      // Vnější pulzující kruh s neonovou září
      ctx.beginPath();
      ctx.arc(target.x, target.y, rOuter, 0, Math.PI * 2);
      ctx.strokeStyle = target.badgeColor || '#ffe600';
      ctx.lineWidth = 3;
      ctx.shadowColor = target.badgeColor || '#ffe600';
      ctx.shadowBlur = 12;
      ctx.stroke();

      // Vnitřní terč
      ctx.beginPath();
      ctx.arc(target.x, target.y, rInner, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 42, 109, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Kříž terče (crosshair)
      ctx.beginPath();
      ctx.moveTo(target.x - rOuter - 5, target.y);
      ctx.lineTo(target.x + rOuter + 5, target.y);
      ctx.moveTo(target.x, target.y - rOuter - 5);
      ctx.lineTo(target.x, target.y + rOuter + 5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // Středový bod (bullseye)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 3, 0, Math.PI * 2);
      ctx.fill();

      // 5. Štítek s názvem cíle (např. LEVÝ VINKL! ⭐)
      const badgeText = target.label;
      ctx.font = 'bold 13px sans-serif';
      const textWidth = ctx.measureText(badgeText).width;
      const badgeY = target.y > 140 ? target.y - 32 : target.y + 32;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(target.x - textWidth / 2 - 10, badgeY - 14, textWidth + 20, 26, 13);
      ctx.fill();
      ctx.strokeStyle = target.badgeColor || '#ffe600';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = target.badgeColor || '#ffe600';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, target.x, badgeY);
    }

    ctx.restore();
  }


  /**
   * Vykreslení hřiště v 2.5D perspektivě
   */
  private drawCourt(ctx: CanvasRenderingContext2D) {
    // Pozadí haly
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 200);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.V_WIDTH, 220);

    // Florbalový povrch (Gerflor - modrá barva používaná na MS ve florbale)
    const floorGrad = ctx.createLinearGradient(0, 200, 0, this.V_HEIGHT);
    floorGrad.addColorStop(0, '#1d4ed8');
    floorGrad.addColorStop(1, '#1e40af');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 200, this.V_WIDTH, this.V_HEIGHT - 200);

    // Bílé mantinely s černou horní lištou
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(35, 215);
    ctx.lineTo(20, this.V_HEIGHT);
    ctx.moveTo(this.V_WIDTH - 35, 215);
    ctx.lineTo(this.V_WIDTH - 20, this.V_HEIGHT);
    ctx.stroke();

    // Florbalové brankoviště (velké brankoviště 4x5m - bílé čáry)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.V_WIDTH / 2 - 130, 210, 260, 110);

    // Malé brankoviště (červená zóna pro florbalového brankáře)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fillRect(this.V_WIDTH / 2 - 80, 215, 160, 55);
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(this.V_WIDTH / 2 - 80, 215, 160, 55);

    // Body pro vhazování (florbalové křížky)
    this.drawFloorballCross(ctx, this.V_WIDTH / 2 - 170, 310);
    this.drawFloorballCross(ctx, this.V_WIDTH / 2 + 170, 310);
  }

  private drawFloorballCross(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
  }

  /**
   * Vykreslení florbalové branky (bílá konstrukce, síť, červená vnitřní zástěrka)
   */
  private drawGoal(ctx: CanvasRenderingContext2D) {
    const g = this.goal;
    const xL = g.x - g.width / 2;
    const xR = g.x + g.width / 2;
    const yTop = g.y - g.height;

    // Síť branky
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(xL, yTop, g.width, g.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let x = xL; x <= xR; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, yTop);
      ctx.lineTo(x, g.y);
      ctx.stroke();
    }
    for (let y = yTop; y <= g.y; y += 12) {
      ctx.beginPath();
      ctx.moveTo(xL, y);
      ctx.lineTo(xR, y);
      ctx.stroke();
    }

    // Vnitřní záchytná síť / plachta (typicky bílá/černá)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(xL + 15, yTop + 15, g.width - 30, g.height - 25);

    // Bílé tyčky a břevno
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = g.postRadius * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xL, g.y);
    ctx.lineTo(xL, yTop);
    ctx.lineTo(xR, yTop);
    ctx.lineTo(xR, g.y);
    ctx.stroke();

    // Spodní oblouky branky vzadu
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(xL, g.y);
    ctx.lineTo(xL + 25, g.y - 20);
    ctx.lineTo(xR - 25, g.y - 20);
    ctx.lineTo(xR, g.y);
    ctx.stroke();

    // 5 tréninkových terčů v síti (vinkly ⭐, břevno 🚀, tyčky ⚡)
    this.drawGoalTargets(ctx);
  }

  /**
   * Vykreslení 5 velkých interaktivních kapes v síti branky pro přesné zamíření
   */
  private drawGoalTargets(ctx: CanvasRenderingContext2D) {
    const pockets = getGoalTargetPockets(this.goal);
    const isAiming = this.isDrawingPath || this.isRunningPath || this.ball.isMoving;
    const pulse = Math.sin(performance.now() * 0.008) * 3;
    const rot = performance.now() * 0.002;

    for (const p of pockets) {
      const isSelected = this.shotTarget && (
        this.shotTarget.label === p.label ||
        Math.hypot(this.shotTarget.x - p.x, this.shotTarget.y - p.y) < 15
      );
      const alpha = isSelected ? 1.0 : (isAiming ? 0.65 : 0.35);
      const radius = isSelected ? 26 + pulse : 18;

      ctx.save();

      // Vnější animovaný prstenec pro zamčený terč
      if (isSelected) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = p.badgeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.shadowColor = p.badgeColor;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.restore();
      }

      // Hlavní tělo kapsy
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(15, 23, 42, 0.85)' : 'rgba(15, 23, 42, 0.4)';
      ctx.fill();

      ctx.strokeStyle = p.badgeColor;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isSelected ? 3.5 : 2;
      if (!isSelected) {
        ctx.setLineDash([5, 4]);
      }
      ctx.stroke();

      if (isSelected) {
        ctx.shadowColor = p.badgeColor;
        ctx.shadowBlur = 18;
        ctx.stroke();

        // Zaměřovací kříž v uzamčené kapse
        ctx.beginPath();
        ctx.moveTo(p.x - radius * 0.7, p.y);
        ctx.lineTo(p.x + radius * 0.7, p.y);
        ctx.moveTo(p.x, p.y - radius * 0.7);
        ctx.lineTo(p.x, p.y + radius * 0.7);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Středový bod
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;

      // Štítek terče (např. ⭐ LEVÝ VINKL!, 🚀 POD BŘEVNO!)
      if (isAiming || isSelected) {
        const badgeText = p.label;
        ctx.font = isSelected ? 'bold 12px sans-serif' : 'bold 10px sans-serif';
        const textW = ctx.measureText(badgeText).width;
        const labelY = p.y < this.goal.y - 60 ? p.y + radius + 14 : p.y - radius - 14;

        if (isSelected) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.roundRect(p.x - textW / 2 - 8, labelY - 11, textW + 16, 22, 11);
          ctx.fill();
          ctx.strokeStyle = p.badgeColor;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        ctx.fillStyle = p.badgeColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, p.x, labelY);
      }

      ctx.restore();
    }
  }

  /**
   * Vykreslení moderního florbalového brankáře s 2.5D hloubkou, polstrováním a maskou
   */
  private drawGoalkeeper(ctx: CanvasRenderingContext2D) {
    const gl = this.goalieAI.goalie;
    const config = this.goalieAI.config;
    ctx.save();
    ctx.translate(gl.x, gl.y);

    const isDivingLeft = gl.state === 'save_left';
    const isDivingRight = gl.state === 'save_right';
    const bodyTilt = isDivingLeft ? -0.18 : (isDivingRight ? 0.18 : 0);

    ctx.rotate(bodyTilt);

    // 1. DVOJITÝ STÍN NA PALUBOVCE (vnější ambientní + vnitřní kontaktní)
    const shadowStretch = Math.abs(bodyTilt) * 24;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 4, (gl.width * 0.7) + shadowStretch, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 2, (gl.width * 0.45) + shadowStretch * 0.6, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. BRANKÁŘSKÉ BOTY (paty a špičky vykukující za kalhotami)
    const leftPadOffset = isDivingLeft ? -18 : 0;
    const rightPadOffset = isDivingRight ? 18 : 0;
    ctx.fillStyle = '#090d16';
    // Levá pata
    ctx.beginPath();
    ctx.roundRect(-28 + leftPadOffset, -8, 14, 10, 3);
    ctx.fill();
    // Pravá pata
    ctx.beginPath();
    ctx.roundRect(14 + rightPadOffset, -8, 14, 10, 3);
    ctx.fill();

    // 3. MOHUTNÉ POLSTROVANÉ KALHOTY V KLEČE
    const pantsGrad = ctx.createLinearGradient(0, -25, 0, 2);
    pantsGrad.addColorStop(0, '#1e293b');
    pantsGrad.addColorStop(1, '#0b1120');

    ctx.fillStyle = pantsGrad;
    // Levá nohavice / stehno a koleno
    ctx.beginPath();
    ctx.roundRect(-36 + leftPadOffset, -24, 30, 24, [8, 8, 4, 4]);
    ctx.fill();
    // Pravá nohavice / stehno a koleno
    ctx.beginPath();
    ctx.roundRect(6 + rightPadOffset, -24, 30, 24, [8, 8, 4, 4]);
    ctx.fill();

    // Zesílené švy a stíny mezi nohavicemi
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6 + leftPadOffset, -18);
    ctx.lineTo(-6 + leftPadOffset, 0);
    ctx.moveTo(6 + rightPadOffset, -18);
    ctx.lineTo(6 + rightPadOffset, 0);
    ctx.stroke();

    // 4. PLASTICKÉ ŽLUTÉ SLIDERY NA KOLENOU (typické florbalové kluzné plochy)
    // Levý slider
    ctx.save();
    ctx.translate(-22 + leftPadOffset, -6);
    ctx.rotate(isDivingLeft ? -0.1 : 0);
    const sliderGrad1 = ctx.createLinearGradient(0, -6, 0, 4);
    sliderGrad1.addColorStop(0, '#fef08a');
    sliderGrad1.addColorStop(0.3, '#facc15');
    sliderGrad1.addColorStop(1, '#ca8a04');
    ctx.fillStyle = sliderGrad1;
    ctx.beginPath();
    ctx.roundRect(-12, -5, 24, 8, 4);
    ctx.fill();
    // Odlesk slideru
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(-8, -4, 16, 2);
    ctx.restore();

    // Pravý slider
    ctx.save();
    ctx.translate(22 + rightPadOffset, -6);
    ctx.rotate(isDivingRight ? 0.1 : 0);
    const sliderGrad2 = ctx.createLinearGradient(0, -6, 0, 4);
    sliderGrad2.addColorStop(0, '#fef08a');
    sliderGrad2.addColorStop(0.3, '#facc15');
    sliderGrad2.addColorStop(1, '#ca8a04');
    ctx.fillStyle = sliderGrad2;
    ctx.beginPath();
    ctx.roundRect(-12, -5, 24, 8, 4);
    ctx.fill();
    // Odlesk slideru
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(-8, -4, 16, 2);
    ctx.restore();

    // 5. MOHUTNÉ TĚLO, POLSTROVANÁ VESTA A DRES
    // Polstrování ramen (široká silueta florbalového gólmana)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-36, -58, 72, 20, 10);
    ctx.fill();

    // Hlavní tělo dresu s 3D gradientem
    const jerseyGrad = ctx.createLinearGradient(-30, -56, 30, -14);
    jerseyGrad.addColorStop(0, config.jerseyColor);
    jerseyGrad.addColorStop(0.6, config.jerseyColor);
    jerseyGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = jerseyGrad;
    ctx.beginPath();
    ctx.moveTo(-30, -56);
    ctx.lineTo(30, -56);
    ctx.quadraticCurveTo(32, -34, 25, -16);
    ctx.lineTo(-25, -16);
    ctx.quadraticCurveTo(-32, -34, -30, -56);
    ctx.closePath();
    ctx.fill();

    // Boční kontrastní sportovní panely vesty
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.beginPath();
    ctx.moveTo(-30, -56);
    ctx.lineTo(-24, -56);
    ctx.lineTo(-20, -16);
    ctx.lineTo(-25, -16);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(30, -56);
    ctx.lineTo(24, -56);
    ctx.lineTo(20, -16);
    ctx.lineTo(25, -16);
    ctx.closePath();
    ctx.fill();

    // Sportovní V-neck límec / chránič klíčních kostí
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, -56);
    ctx.lineTo(0, -46);
    ctx.lineTo(12, -56);
    ctx.stroke();

    // Číslo 1 na dresu brankáře s drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', 0, -32);
    ctx.restore();

    // 6. ANATOMICKÉ PAŽE A FLORBALOVÉ CHYTACÍ RUKAVICE S PRSTY
    const armReachLeftX = isDivingLeft ? -26 : 0;
    const armReachLeftY = isDivingLeft ? -22 : 0;
    const armReachRightX = isDivingRight ? 26 : 0;
    const armReachRightY = isDivingRight ? -22 : 0;

    // Levá ruka a rukavice
    this.drawGoalieArmAndGlove(ctx, {
      side: 'left',
      shoulderX: -28,
      shoulderY: -50,
      handX: -36 + armReachLeftX,
      handY: -22 + armReachLeftY,
      isDivingSide: isDivingLeft,
      jerseyColor: config.jerseyColor,
    });

    // Pravá ruka a rukavice
    this.drawGoalieArmAndGlove(ctx, {
      side: 'right',
      shoulderX: 28,
      shoulderY: -50,
      handX: 36 + armReachRightX,
      handY: -22 + armReachRightY,
      isDivingSide: isDivingRight,
      jerseyColor: config.jerseyColor,
    });

    // 7. FLORBALOVÁ MASKA (HELMA) S OČIMA A MŘÍŽKOU
    ctx.save();
    ctx.translate(0, -68);

    // Tvar helmy (aerodynamický profil masky s chráničem brady)
    const maskGrad = ctx.createRadialGradient(-5, -6, 4, 0, 0, 20);
    maskGrad.addColorStop(0, '#ffffff');
    maskGrad.addColorStop(0.3, config.maskColor);
    maskGrad.addColorStop(1, '#090d16');

    ctx.fillStyle = maskGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -10);
    ctx.quadraticCurveTo(-18, 4, -10, 14);
    ctx.lineTo(0, 16);
    ctx.lineTo(10, 14);
    ctx.quadraticCurveTo(18, 4, 16, -10);
    ctx.quadraticCurveTo(14, -20, 0, -20);
    ctx.quadraticCurveTo(-14, -20, -16, -10);
    ctx.closePath();
    ctx.fill();

    // Unikátní polep / grafika masky podle obtížnosti
    if (config.id === 'junior') {
      // Junior: dva bílé sportovní závodní pruhy přes temeno
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, -19, 3, 10);
      ctx.fillRect(3, -19, 3, 10);
    } else if (config.id === 'profi') {
      // Profi: neonový blesk po stranách
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(-15, -12); ctx.lineTo(-9, -6); ctx.lineTo(-12, -4); ctx.lineTo(-8, 2);
      ctx.lineTo(-13, -2); ctx.closePath(); ctx.fill();

      ctx.beginPath();
      ctx.moveTo(15, -12); ctx.lineTo(9, -6); ctx.lineTo(12, -4); ctx.lineTo(8, 2);
      ctx.lineTo(13, -2); ctx.closePath(); ctx.fill();
    } else {
      // Legenda: zlatá královská koruna a ohnivé runy
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-8, -19);
      ctx.lineTo(-4, -14);
      ctx.lineTo(0, -19);
      ctx.lineTo(4, -14);
      ctx.lineTo(8, -19);
      ctx.lineTo(6, -12);
      ctx.lineTo(-6, -12);
      ctx.closePath();
      ctx.fill();
    }

    // OBLIČEJ A OČI ZA MŘÍŽKOU
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-10, -6, 20, 14, 5);
    ctx.fill();

    // Soustředěné oči brankáře
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-5, -1, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -1, 3.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Zorničky soustředěné na míček (dole)
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(-5, 0, 1.8, 0, Math.PI * 2);
    ctx.arc(5, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-5, 0, 0.9, 0, Math.PI * 2);
    ctx.arc(5, 0, 0.9, 0, Math.PI * 2);
    ctx.fill();
    // Obočí (odhodlaný výraz)
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(-2, -3);
    ctx.moveTo(8, -4); ctx.lineTo(2, -3);
    ctx.stroke();

    // CHROMOVÁ CAT-EYE MŘÍŽKA HELMY
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-11, -8, 22, 18, 4);
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
    ctx.moveTo(-11, 5); ctx.lineTo(11, 5);
    ctx.moveTo(0, -8); ctx.lineTo(0, 10);
    ctx.moveTo(-6, -8); ctx.lineTo(-6, 10);
    ctx.moveTo(6, -8); ctx.lineTo(6, 10);
    ctx.stroke();

    // Středový lesk na mřížce
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10, -7); ctx.lineTo(-3, -7);
    ctx.stroke();

    ctx.restore();

    // 8. ODZNAK OBTÍŽNOSTI NAD HLAVOU
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    const badgeBg = ctx.createLinearGradient(-50, -106, 50, -86);
    badgeBg.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
    badgeBg.addColorStop(1, 'rgba(30, 41, 59, 0.92)');
    ctx.fillStyle = badgeBg;
    ctx.beginPath();
    ctx.roundRect(-50, -106, 100, 22, 11);
    ctx.fill();

    ctx.strokeStyle = config.id === 'legend' ? '#fbbf24' : (config.id === 'profi' ? '#38bdf8' : '#4ade80');
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.badge, 0, -95);

    ctx.restore();
  }

  /**
   * Vykreslení paže a florbalové chytací rukavice brankáře
   */
  private drawGoalieArmAndGlove(
    ctx: CanvasRenderingContext2D,
    opts: {
      side: 'left' | 'right';
      shoulderX: number;
      shoulderY: number;
      handX: number;
      handY: number;
      isDivingSide: boolean;
      jerseyColor: string;
    }
  ) {
    const { side, shoulderX, shoulderY, handX, handY, isDivingSide, jerseyColor } = opts;
    const isLeft = side === 'left';

    // Rukáv dresu (od ramene k lokti)
    ctx.strokeStyle = jerseyColor;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    const elbowX = (shoulderX + handX) * 0.5 + (isLeft ? -4 : 4);
    const elbowY = (shoulderY + handY) * 0.5;
    ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
    ctx.stroke();

    // Kompresní spodní rukáv na předloktí
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // FLORBALOVÁ RUKAVICE (Dlaň a prsty)
    ctx.save();
    ctx.translate(handX, handY);

    const handAngle = Math.atan2(handY - elbowY, handX - elbowX) + (isLeft ? -Math.PI / 2 : Math.PI / 2);
    ctx.rotate(handAngle * 0.3);

    // Zápěstní manžeta s páskem
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-6, -4, 12, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-5, -2, 10, 2);

    // Dlaň rukavice (bílo-černý profesionální florbalový design)
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(-7, 2, 14, 11, 4);
    ctx.fill();

    // Silikonové gripy na dlani
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 7, 3, 0, Math.PI * 2);
    ctx.fill();

    // Prsty (rozevřené při zákroku pro maximální pokrytí)
    const fingerSpread = isDivingSide ? 1.4 : 1.0;
    ctx.fillStyle = '#f8fafc';
    const fingerPositions = [-5, -2, 2, 5];
    fingerPositions.forEach((fx, idx) => {
      const flen = (idx === 1 || idx === 2) ? 8 : 6;
      const spreadX = fx * fingerSpread;
      ctx.beginPath();
      ctx.roundRect(spreadX - 1.5, 12, 3, flen, 1.5);
      ctx.fill();

      // Silikonový přilnavý terčík na špičce prstu
      ctx.fillStyle = '#f97316';
      ctx.fillRect(spreadX - 1.2, 12 + flen - 2.5, 2.4, 2);
      ctx.fillStyle = '#f8fafc';
    });

    // Palec
    ctx.fillStyle = '#f8fafc';
    const thumbX = isLeft ? 6 : -6;
    ctx.beginPath();
    ctx.roundRect(thumbX - (isLeft ? 0 : 3), 4, 3.5, 6, 1.5);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Vykreslení nohy hráčky s kraťasy, kůží, ponožkou a sálovou botou
   */
  private drawPlayerLegAndShoe(
    ctx: CanvasRenderingContext2D,
    opts: {
      x: number;
      baseY: number;
      offsetY: number;
      jerseyColor: string;
    }
  ) {
    const { x, baseY, offsetY, jerseyColor } = opts;
    const currentY = baseY + offsetY;

    // Šortky (nohavice)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(x - 6, currentY - 2, 12, 14, [0, 0, 3, 3]);
    ctx.fill();

    // Odhalená noha (stehno/koleno)
    ctx.fillStyle = '#fed7aa';
    ctx.fillRect(x - 4, currentY + 10, 8, 8);

    // Bílá sportovní ponožka s proužkem v barvě dresu
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x - 4.5, currentY + 16, 9, 8);
    // Proužek ponožky
    ctx.fillStyle = jerseyColor;
    ctx.fillRect(x - 4.5, currentY + 17, 9, 2);

    // SÁLOVÁ FLORBALOVÁ BOTA
    const shoeY = currentY + 22;
    // Tělo boty (neonově žlutá s černým detailem)
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(x - 7, shoeY, 14, 7, [3, 5, 2, 2]);
    ctx.fill();

    // Karamelová gumová podrážka (gum sole)
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.roundRect(x - 7, shoeY + 6, 14, 3, [0, 0, 2, 2]);
    ctx.fill();

    // Šněrování / tkaničky boty
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3, shoeY + 1, 6, 1.5);
    ctx.fillRect(x - 3, shoeY + 3.5, 6, 1.5);
  }

  /**
   * Vykreslení postavičky Julinky s hokejkou, dynamickým culíkem a atletickými detaily
   */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.playerX, this.playerY);

    if (this.isRunningPath && Math.abs(this.playerFacingAngle) > 0.05) {
      ctx.rotate(this.playerFacingAngle * 0.35);
    }

    // Bobbing těla při běhu (plynulý atletický běh)
    const bob = this.isRunningPath ? Math.abs(Math.sin(this.runTimer * 20)) * 5 : 0;
    ctx.translate(0, -bob);

    // 1. DVOJITÝ STÍN HRÁČKY NA PALUBOVCE
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 46 + bob, 34, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 44 + bob, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. ATLETICKÉ NOHY, ŠORTKY, PONOŽKY A SÁLOVÉ BOTY
    const legCycle = this.runTimer * 20;
    const legOffset1 = this.isRunningPath ? Math.sin(legCycle) * 14 : 0;
    const legOffset2 = this.isRunningPath ? -Math.sin(legCycle) * 14 : 0;

    // Levá noha
    this.drawPlayerLegAndShoe(ctx, {
      x: -12,
      baseY: 20,
      offsetY: legOffset1,
      jerseyColor: this.playerConfig.jerseyColor,
    });

    // Pravá noha
    this.drawPlayerLegAndShoe(ctx, {
      x: 12,
      baseY: 20,
      offsetY: legOffset2,
      jerseyColor: this.playerConfig.jerseyColor,
    });

    // 3. SPORTOVNÍ ŠORTKY (pas a spojnice)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-18, 16, 36, 12, [2, 2, 4, 4]);
    ctx.fill();
    // Bílý postranní reflexní pruh šortek
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-18, 17, 2, 10);
    ctx.fillRect(16, 17, 2, 10);

    // 4. PROFESIONÁLNÍ FLORBALKA (Shaft, spirálový grip a děrovaná čepel)
    ctx.save();
    ctx.translate(15, 28);
    ctx.rotate(this.stickAngle);

    // Karbonový shaft
    const shaftGrad = ctx.createLinearGradient(-10, -65, 10, 15);
    shaftGrad.addColorStop(0, '#334155');
    shaftGrad.addColorStop(0.5, '#0f172a');
    shaftGrad.addColorStop(1, '#1e293b');

    ctx.strokeStyle = shaftGrad;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -68);
    ctx.lineTo(10, 16);
    ctx.stroke();

    // Spirálově vinutá bílá florbalová omotávka (grip)
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(-10, -68);
    ctx.lineTo(-2, -32);
    ctx.stroke();

    // Spirálové proužky / překlady gripu
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.2;
    for (let gy = -64; gy <= -34; gy += 6) {
      const gx = -10 + (gy - (-68)) * (8 / 36);
      ctx.beginPath();
      ctx.moveTo(gx - 3, gy);
      ctx.lineTo(gx + 3, gy + 3);
      ctx.stroke();
    }

    // Zářivě neonově růžová čepel s prolisy / žebrováním
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.quadraticCurveTo(28, 17, 38, 23);
    ctx.stroke();

    // Zpevňující žebrování / mřížka čepele
    ctx.strokeStyle = '#be185d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, 17); ctx.lineTo(16, 21);
    ctx.moveTo(22, 17); ctx.lineTo(23, 22);
    ctx.moveTo(29, 18); ctx.lineTo(30, 23);
    ctx.stroke();

    // Klenutá špička čepele
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(37, 22, 2.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // 5. ANATOMICKY TVAROVANÝ DRES JULINKY
    const playerJerseyGrad = ctx.createLinearGradient(-26, -26, 26, 22);
    playerJerseyGrad.addColorStop(0, this.playerConfig.jerseyColor);
    playerJerseyGrad.addColorStop(0.7, this.playerConfig.jerseyColor);
    playerJerseyGrad.addColorStop(1, '#0f172a');

    ctx.fillStyle = playerJerseyGrad;
    ctx.beginPath();
    ctx.moveTo(-24, -24);
    ctx.quadraticCurveTo(0, -26, 24, -24);
    ctx.quadraticCurveTo(26, -2, 22, 18);
    ctx.lineTo(-22, 18);
    ctx.quadraticCurveTo(-26, -2, -24, -24);
    ctx.closePath();
    ctx.fill();

    // Boční kontrastní sportovní vsadky
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(-24, -20);
    ctx.lineTo(-20, -20);
    ctx.lineTo(-19, 16);
    ctx.lineTo(-22, 16);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(24, -20);
    ctx.lineTo(20, -20);
    ctx.lineTo(19, 16);
    ctx.lineTo(22, 16);
    ctx.closePath();
    ctx.fill();

    // Sportovní V-neck límeček
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(0, -16);
    ctx.lineTo(10, -24);
    ctx.stroke();

    // JMÉNO A ČÍSLO NA DRESU S DROP SHADOW
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.playerConfig.name.toUpperCase(), 0, -6);

    ctx.font = '900 23px system-ui, -apple-system, sans-serif';
    ctx.fillText(this.playerConfig.number.toString(), 0, 14);
    ctx.restore();

    // 6. PAŽE DRŽÍCÍ FLORBALKU
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -18);
    ctx.quadraticCurveTo(-14, -6, 2, 4);
    ctx.stroke();
    // Potítko na zápěstí v barvě dresu
    ctx.strokeStyle = this.playerConfig.jerseyColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(2, 4);
    ctx.stroke();

    // Pravá paže
    ctx.strokeStyle = '#fed7aa';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(22, -18);
    ctx.quadraticCurveTo(18, 0, 12, 14);
    ctx.stroke();

    // 7. HLAVA, OBLIČEJ A UŠI
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.ellipse(0, -42, 15, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Uši
    ctx.fillStyle = '#fdba74';
    ctx.beginPath();
    ctx.arc(-15, -42, 3.5, 0, Math.PI * 2);
    ctx.arc(15, -42, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 8. ÚČES, LESK NA VLASECH A SPORTOVNÍ ČELENKA
    ctx.fillStyle = '#5c2c16';
    ctx.beginPath();
    ctx.arc(0, -45, 16.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();

    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(-5, -46, 14, Math.PI * 1.0, Math.PI * 1.8);
    ctx.arc(5, -46, 14, Math.PI * 1.2, Math.PI * 2.0);
    ctx.fill();

    // Světelný lesk na temeni
    ctx.fillStyle = 'rgba(217, 119, 6, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -53, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pružná sportovní čelenka ladící s barvou dresu
    ctx.strokeStyle = this.playerConfig.jerseyColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -43, 16, Math.PI * 0.88, Math.PI * 0.12);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -43, 16, Math.PI * 0.88, Math.PI * 0.12);
    ctx.stroke();

    // 9. DYNAMICKÝ VLAJÍCÍ CULÍK (organický pohyb a odstředivá síla!)
    const ponySway = this.isRunningPath ? Math.cos(this.runTimer * 20) * 5 : 0;
    const centrifugalOffset = this.isRunningPath ? -this.playerFacingAngle * 14 : 0;
    const ponyX = 14 + centrifugalOffset;
    const ponyY = -48 + ponySway;

    // Gumička do vlasů
    ctx.fillStyle = this.playerConfig.jerseyColor;
    ctx.beginPath();
    ctx.arc(10, -47, 4, 0, Math.PI * 2);
    ctx.fill();

    // Hlavní tělo culíku
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.moveTo(10, -49);
    ctx.quadraticCurveTo(ponyX + 4, ponyY - 4, ponyX + 16, ponyY + 2);
    ctx.quadraticCurveTo(ponyX + 10, ponyY + 12, 8, -44);
    ctx.closePath();
    ctx.fill();

    // Pramen s odleskem v culíku
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(11, -47);
    ctx.quadraticCurveTo(ponyX + 6, ponyY, ponyX + 13, ponyY + 4);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Vykreslení děravého florbalového míčku
   */
  private drawBall(ctx: CanvasRenderingContext2D) {
    const b = this.ball;
    // Perspektivní škálování: čím je míček blíže brance, tím je menší
    const scale = 0.45 + 0.55 * Math.max(0, (b.y - 200) / (740 - 200));
    const r = b.radius * scale;
    const renderY = b.y - b.z;

    // Stín míčku na podlaze
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stopa míčku (trail)
    for (const t of b.trail) {
      if (t.alpha <= 0) continue;
      ctx.fillStyle = `rgba(5, 217, 232, ${t.alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(b.x, renderY);
    ctx.rotate(b.rotation);

    // Bílý florbalový míček s leskem
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.8, '#f1f5f9');
    grad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Dírky florbalového míčku (charakteristický znak florbalu!)
    ctx.fillStyle = '#94a3b8';
    const holes = [
      { x: 0, y: 0 },
      { x: -r * 0.45, y: -r * 0.35 },
      { x: r * 0.45, y: -r * 0.35 },
      { x: -r * 0.45, y: r * 0.35 },
      { x: r * 0.45, y: r * 0.35 },
    ];
    for (const h of holes) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }


  /**
   * Vykreslení ukazatelů (HUD: Skóre, číslo nájezdu, tutoriál panel)
   */
  private drawHUD(ctx: CanvasRenderingContext2D) {
    if (this.mode === 'shootout') {
      // Horní panel skóre (stavová lišta)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(16, 16, this.V_WIDTH - 32, 60, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`NÁJEZD ${this.score.currentShot}/${this.score.maxShots}`, 32, 52);

      // Zobrazení úrovně brankáře uprostřed stavové lišty
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(this.goalieAI.config.badge, this.V_WIDTH / 2, 52);

      // Vpravo: Góly a body
      ctx.textAlign = 'right';
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 15px sans-serif';
      const comboTxt = this.score.combo > 1 ? ` 🔥${this.score.combo}x` : '';
      ctx.fillText(`${this.score.goals}⚽ ${this.score.points.toLocaleString('cs-CZ')} b.${comboTxt}`, this.V_WIDTH - 32, 52);
    } else if (this.mode === 'tutorial') {
      const step = this.tutorial.getCurrentStep();
      if (step) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(20, 16, this.V_WIDTH - 40, 80, 16);
        ctx.fill();

        ctx.fillStyle = '#05d9e8';
        ctx.font = 'bold 17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(step.title, this.V_WIDTH / 2, 45);

        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        ctx.fillText(step.instruction, this.V_WIDTH / 2, 74);
      }
    }
  }

  /**
   * Zobrazení vyskakujícího banneru při gólu / výsledku
   */
  private drawBanner(ctx: CanvasRenderingContext2D) {
    if (this.bannerTimer <= 0) return;

    ctx.save();
    ctx.translate(this.V_WIDTH / 2, 420);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.roundRect(-210, -50, 420, 100, 20);
    ctx.fill();
    ctx.strokeStyle = this.bannerColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = this.bannerColor;
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = this.bannerColor;
    ctx.shadowBlur = 15;
    ctx.fillText(this.bannerText, 0, -5);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.font = '16px sans-serif';
    ctx.fillText(this.bannerSubtext, 0, 30);

    ctx.restore();
  }

  /**
   * Vyhodnocení zápasu po 5 nájezdech (GameOver) se Sídlem slávy (TOP 3)
   */
  private drawGameOverOverlay(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);

    // Karta s vyhodnocením
    ctx.fillStyle = 'rgba(30, 41, 59, 0.75)';
    ctx.beginPath();
    ctx.roundRect(20, 50, this.V_WIDTH - 40, 830, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Nadpis
    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KONEC ZÁPASU! 🏆', this.V_WIDTH / 2, 95);

    // Odznak hráče (Jméno, číslo a barva dresu)
    const playerText = `👕 ${this.playerConfig.name} #${this.playerConfig.number}`;
    ctx.font = 'bold 15px sans-serif';
    const textWidth = ctx.measureText(playerText).width;
    const badgeW = textWidth + 30;
    ctx.fillStyle = this.playerConfig.jerseyColor;
    ctx.beginPath();
    ctx.roundRect(this.V_WIDTH / 2 - badgeW / 2, 115, badgeW, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(playerText, this.V_WIDTH / 2, 134);

    // Velké skóre
    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`${this.score.points.toLocaleString('cs-CZ')} BODŮ`, this.V_WIDTH / 2, 185);

    // Titul podle bodů
    const playerTitle = getPlayerTitle(this.score.points);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(`${playerTitle.badge} ${playerTitle.title}`, this.V_WIDTH / 2, 218);

    // Shrnutí gólů a brankáře
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText(
      `Góly: ${this.score.goals}/${this.score.maxShots} • Brankář: ${this.goalieAI.config.badge}`,
      this.V_WIDTH / 2,
      245
    );

    // Zlatý banner při umístění v TOP 3
    if (this.lastLeaderboardRank) {
      ctx.fillStyle = 'rgba(255, 230, 0, 0.15)';
      ctx.beginPath();
      ctx.roundRect(40, 260, this.V_WIDTH - 80, 32, 16);
      ctx.fill();
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(
        `🎉 NOVÝ ZÁPIS DO SÍNĚ SLÁVY: ${this.lastLeaderboardRank}. MÍSTO! 🎉`,
        this.V_WIDTH / 2,
        281
      );
    }

    // --- SÍŇ SLÁVY (TOP 3) TABULKA ---
    const tableTop = 318;
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('🏆 SÍŇ SLÁVY (TOP 3 HRÁČI)', this.V_WIDTH / 2, tableTop);

    const medals = ['🥇', '🥈', '🥉'];
    const rowH = 64;
    const startY = tableTop + 16;

    this.leaderboard.slice(0, 3).forEach((entry, idx) => {
      const y = startY + idx * (rowH + 8);
      const isCurrent = this.lastLeaderboardRank === idx + 1;

      // Pozadí řádku
      ctx.fillStyle = isCurrent ? 'rgba(0, 255, 204, 0.18)' : 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.roundRect(36, y, this.V_WIDTH - 72, rowH, 14);
      ctx.fill();
      ctx.strokeStyle = isCurrent ? '#00ffcc' : 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.stroke();

      // Medaile
      ctx.textAlign = 'left';
      ctx.font = '24px sans-serif';
      ctx.fillText(medals[idx] || '🏅', 48, y + 41);

      // Malý dres hráče s číslem
      ctx.fillStyle = entry.jerseyColor || '#ec4899';
      ctx.beginPath();
      ctx.roundRect(86, y + 15, 30, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(entry.number.toString(), 101, y + 34);

      // Jméno hráče
      ctx.textAlign = 'left';
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(entry.name, 126, y + 31);

      // Podrobnosti (Góly, brankář, datum)
      const goalieBadge = entry.goalieLevel === 'legend' ? '🔴 Legenda' : (entry.goalieLevel === 'profi' ? '🟡 Profi' : '🟢 Junior');
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${entry.goals}/${entry.maxShots || 5} gólů • ${goalieBadge} • ${entry.date || ''}`, 126, y + 49);

      // Body napravo
      ctx.textAlign = 'right';
      ctx.fillStyle = isCurrent ? '#00ffcc' : '#ffe600';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${entry.score.toLocaleString('cs-CZ')} b.`, this.V_WIDTH - 50, y + 39);
    });

    // --- TLAČÍTKA ---
    // 1. Tlačítko HRÁT ZNOVU
    const btnPlayY = 575;
    ctx.fillStyle = '#ff2a6d';
    ctx.beginPath();
    ctx.roundRect(this.V_WIDTH / 2 - 130, btnPlayY, 260, 50, 25);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 19px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HRÁT ZNOVU 🔄', this.V_WIDTH / 2, btnPlayY + 32);

    // 2. Tlačítko UPRAVIT HRÁČE
    const btnEditY = 640;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.beginPath();
    ctx.roundRect(this.V_WIDTH / 2 - 130, btnEditY, 260, 46, 23);
    ctx.fill();
    ctx.strokeStyle = this.playerConfig.jerseyColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('UPRAVIT HRÁČE 👕', this.V_WIDTH / 2, btnEditY + 29);

    ctx.restore();
  }

  public handleClickAt(x: number, y: number) {
    if (this.nextShotTimer > 0) {
      this.nextShotTimer = 0;
      if (this.mode === 'shootout') {
        this.advanceShootout();
      } else {
        this.resetBall();
      }
      return;
    }

    if (this.mode === 'shootout') {
      // Klepnutí na odznak brankáře ve stavové liště nahoře (y: 16-76, střed x)
      if (y >= 16 && y <= 76 && x >= this.V_WIDTH / 2 - 75 && x <= this.V_WIDTH / 2 + 75) {
        this.cycleGoalieLevel();
        return;
      }
    }

    if (this.mode === 'tutorial') {
      // Kliknutí na tlačítko Jít na nájezdy v tutoriálu
      if (x >= this.V_WIDTH / 2 - 140 && x <= this.V_WIDTH / 2 + 140 && y >= 840 && y <= 920) {
        this.startShootout();
      }
    } else if (this.mode === 'gameover') {
      // 1. Tlačítko HRÁT ZNOVU (y: 570 - 630)
      if (y >= 570 && y <= 630 && x >= this.V_WIDTH / 2 - 140 && x <= this.V_WIDTH / 2 + 140) {
        this.startShootout();
        return;
      }
      // 2. Tlačítko UPRAVIT HRÁČE (y: 635 - 695)
      if (y >= 635 && y <= 695 && x >= this.V_WIDTH / 2 - 140 && x <= this.V_WIDTH / 2 + 140) {
        this.onOpenPlayerModal?.();
        return;
      }
      // Kliknutí mimo tlačítka v režimu gameover spustí novou hru
      this.startShootout();
    }
  }
}
