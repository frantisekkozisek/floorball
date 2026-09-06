import { Ball, GameScore, GameMode, GoalDimensions, TouchPoint, TrickType, ShotTarget, GoalieLevel, GoalieConfig } from './types';
import { analyzeGesture, analyzeDrawnPath, checkGoalCollision, updateBallPhysics, partitionStroke, calculateShotVelocity } from './physics';
import { GoalkeeperAI } from './goalkeeper';
import { ParticleSystem } from './particles';
import { TutorialManager } from './tutorial';
import { soundManager } from '../audio/soundEffects';

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

  public mode: GameMode = 'shootout';
  public score: GameScore = {
    shotsTotal: 0,
    goals: 0,
    saves: 0,
    posts: 0,
    currentShot: 1,
    maxShots: 5,
  };

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

  public startShootout() {
    this.mode = 'shootout';
    this.score = {
      shotsTotal: 0,
      goals: 0,
      saves: 0,
      posts: 0,
      currentShot: 1,
      maxShots: 5,
    };
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
      this.touchPoints = [{ x: pos.x, y: pos.y, time: performance.now() }];

      // Začátek kreslení trasy pro Julinku (POUZE když míček neletí, Julinka neběží a nečeká se na další nájezd)
      if (!this.ball.isMoving && !this.isRunningPath && this.nextShotTimer <= 0) {
        this.isDrawingPath = true;
        // Trasa začíná u nohou Julinky a pokračuje k prstu
        this.rawDrawnPoints = [
          { x: this.playerX, y: this.playerY },
          { x: pos.x, y: pos.y },
        ];
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
        if (last && Math.hypot(pos.x - last.x, pos.y - last.y) > 6) {
          this.rawDrawnPoints.push({ x: pos.x, y: pos.y });
          this.updatePartitionedStroke();

          // Tichý zvuk vedení míčku při kreslení
          if (now - this.lastDribbleSoundTime > 220) {
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

        // Pokud je nakreslená trasa delší než 25px, Julinka se po ní rozběhne!
        if (totalLength > 25 && this.drawnPath.length >= 2) {
          this.isRunningPath = true;
          this.pathSegmentIndex = 0;
          this.pathSegmentProgress = 0;
          this.runTimer = 0;
        } else {
          // Krátký ťuk na obrazovku -> přímá střela
          this.attemptShot(pos);
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
    const partitioned = partitionStroke(this.rawDrawnPoints, this.goal);
    this.drawnPath = partitioned.runPath;
    this.shotTarget = partitioned.shotTarget;
    this.releasePoint = partitioned.releasePoint;
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

    soundManager.playStickHit();
    this.stickAngle = 0.6; // prudký švih hokejkou

    const dx = shot.targetX - this.ball.x;
    const dy = shot.targetY - this.ball.y;
    const dist = Math.hypot(dx, dy);

    this.ball.vx = (dx / dist) * shot.speed;
    this.ball.vy = (dy / dist) * shot.speed;
    this.ball.vz = shot.lift * 260;
    this.ball.isMoving = true;

    if (shot.type === 'zorro') {
      soundManager.playWhoosh();
    }

    this.goalieAI.onShotInitiated(shot.type, shot.targetX);

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
        this.showBanner('GÓÓÓL!', 'Nádherná trefa, Julinko!', '#ffe600', 2.0);
      } else if (result === 'post') {
        this.score.posts++;
        this.showBanner('CINK! TYČKA!', 'Chyběl jen kousíček!', '#05d9e8', 2.0);
      } else if (result === 'save') {
        this.score.saves++;
        this.showBanner('CHYCENO!', 'Brankář se vytáhl!', '#ff2a6d', 2.0);
      } else {
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

    // 2. Bod odpalu na konci běžecké trasy
    const launchPos = this.releasePoint || (this.drawnPath.length > 0 ? this.drawnPath[this.drawnPath.length - 1] : { x: this.playerX, y: this.playerY });

    if (this.isDrawingPath || this.isRunningPath) {
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.arc(launchPos.x, launchPos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
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
  }

  /**
   * Vykreslení florbalového brankáře
   */
  private drawGoalkeeper(ctx: CanvasRenderingContext2D) {
    const gl = this.goalieAI.goalie;
    ctx.save();
    ctx.translate(gl.x, gl.y);

    const isDivingLeft = gl.state === 'save_left';
    const isDivingRight = gl.state === 'save_right';
    const bodyTilt = isDivingLeft ? -0.16 : (isDivingRight ? 0.16 : 0);

    ctx.rotate(bodyTilt);

    // Stín brankáře (rozšiřuje se při skoku)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, (gl.width * 0.6) + (Math.abs(bodyTilt) * 20), 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chrániče kolen a florbalové betony v kleče
    ctx.fillStyle = '#0f172a';
    const leftPadOffset = isDivingLeft ? -16 : 0;
    const rightPadOffset = isDivingRight ? 16 : 0;
    ctx.fillRect(-34 + leftPadOffset, -20, 28, 20);
    ctx.fillRect(6 + rightPadOffset, -20, 28, 20);

    // Žluté slidery na kolenou (typické pro florbal)
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(-30 + leftPadOffset, -6, 20, 5);
    ctx.fillRect(10 + rightPadOffset, -6, 20, 5);

    // Brankářský dres (dle zvolené obtížnosti)
    ctx.fillStyle = this.goalieAI.config.jerseyColor;
    ctx.beginPath();
    ctx.roundRect(-26, -55, 52, 42, [8, 8, 4, 4]);
    ctx.fill();

    // Číslo 1 na dresu brankáře
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1', 0, -26);

    // Ruce brankáře s florbalovými rukavicemi
    const armReachLeft = isDivingLeft ? -22 : 0;
    const armReachRight = isDivingRight ? 22 : 0;
    const armTilt = isDivingLeft ? -20 : (isDivingRight ? 20 : 0);

    // Levá ruka a bílá florbalová rukavice
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-38 + armReachLeft, -48 + armTilt, 12, 28);
    ctx.fillStyle = '#ffffff'; // rukavice
    ctx.beginPath();
    ctx.arc(-32 + armReachLeft, -20 + armTilt, 9, 0, Math.PI * 2);
    ctx.fill();

    // Pravá ruka a bílá florbalová rukavice
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(26 + armReachRight, -48 - armTilt, 12, 28);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32 + armReachRight, -20 - armTilt, 9, 0, Math.PI * 2);
    ctx.fill();

    // Brankářská maska s mřížkou (barva dle obtížnosti)
    ctx.fillStyle = this.goalieAI.config.maskColor;
    ctx.beginPath();
    ctx.arc(0, -68, 16, 0, Math.PI * 2);
    ctx.fill();

    // Černá mřížka masky
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-10, -72, 20, 12);
    ctx.beginPath();
    ctx.moveTo(-10, -66);
    ctx.lineTo(10, -66);
    ctx.moveTo(0, -72);
    ctx.lineTo(0, -60);
    ctx.stroke();

    // Zobrazení štítku obtížnosti brankáře nad hlavou
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.beginPath();
    ctx.roundRect(-46, -104, 92, 20, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.goalieAI.config.badge, 0, -90);

    ctx.restore();
  }

  /**
   * Vykreslení postavičky Julinky s hokejkou
   */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.playerX, this.playerY);

    if (this.isRunningPath && Math.abs(this.playerFacingAngle) > 0.05) {
      ctx.rotate(this.playerFacingAngle * 0.35); // jemné naklonění těla do zatáčky
    }

    // Bobbing těla při běhu (tělo se pohupuje nahoru a dolů)
    const bob = this.isRunningPath ? Math.abs(Math.sin(this.runTimer * 20)) * 5 : 0;
    ctx.translate(0, -bob);

    // Stín hráčky
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 45 + bob, 35, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Běžící nohy a svítivé florbalové sálovky
    const legOffset = this.isRunningPath ? Math.sin(this.runTimer * 20) * 14 : 0;
    ctx.fillStyle = '#0f172a'; // šortky
    ctx.fillRect(-18, 20 + legOffset, 12, 16);
    ctx.fillRect(6, 20 - legOffset, 12, 16);

    ctx.fillStyle = '#ffe600'; // neonově žluté sálovky
    ctx.fillRect(-20, 35 + legOffset, 15, 8);
    ctx.fillRect(4, 35 - legOffset, 15, 8);

    // Florbalová hokejka (shaft a čepel)
    ctx.save();
    ctx.translate(15, 30);
    ctx.rotate(this.stickAngle);

    // Shaft hole (karbonově černý s bílou omotávkou)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, -65);
    ctx.lineTo(10, 15);
    ctx.stroke();

    // Omotávka
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-10, -65);
    ctx.lineTo(-2, -35);
    ctx.stroke();

    // Florbalová čepel (zářivě růžová neonová čepel!)
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(10, 15);
    ctx.quadraticCurveTo(28, 16, 38, 22);
    ctx.stroke();
    ctx.restore();

    // Tělo hráčky (dres Julinky s číslem)
    ctx.fillStyle = '#ec4899'; // Růžovo-fialový moderní florbalový dres
    ctx.beginPath();
    ctx.roundRect(-28, -25, 56, 50, [12, 12, 6, 6]);
    ctx.fill();

    // Jméno a číslo na zádech
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JULINKA', 0, -8);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('7', 0, 16);

    // Hlava a culík
    ctx.fillStyle = '#fbcfe8'; // kůže
    ctx.beginPath();
    ctx.arc(0, -42, 16, 0, Math.PI * 2);
    ctx.fill();

    // Vlasy s culíkem a sportovní čelenkou
    ctx.fillStyle = '#78350f'; // hnědé vlasy
    ctx.beginPath();
    ctx.arc(0, -46, 17, Math.PI, Math.PI * 2);
    ctx.fill();

    // Růžová čelenka
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -43, 16, Math.PI * 0.9, Math.PI * 0.1);
    ctx.stroke();

    // Culík vlající dozadu
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(14, -50, 10, 0, Math.PI * 2);
    ctx.fill();

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
      // Horní panel skóre
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(20, 16, this.V_WIDTH - 40, 60, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`NÁJEZD ${this.score.currentShot}/${this.score.maxShots}`, 36, 52);

      // Zobrazení úrovně brankáře uprostřed horního panelu
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(this.goalieAI.config.badge, this.V_WIDTH / 2, 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`GÓLY: ${this.score.goals}`, this.V_WIDTH - 36, 52);
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

      // Tlačítko pro okamžité přeskočení tréninku na hrací ploše
      ctx.fillStyle = 'rgba(255, 42, 109, 0.9)';
      ctx.beginPath();
      ctx.roundRect(this.V_WIDTH / 2 - 130, 855, 260, 46, 23);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏆 JÍT NA NÁJEZDY ⏩', this.V_WIDTH / 2, 884);
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
   * Vyhodnocení zápasu po 5 nájezdech (GameOver)
   */
  private drawGameOverOverlay(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(0, 0, this.V_WIDTH, this.V_HEIGHT);

    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KONEC NÁJEZDŮ!', this.V_WIDTH / 2, 280);

    ctx.fillStyle = '#ffffff';
    ctx.font = '22px sans-serif';
    ctx.fillText(`Vstřelené góly: ${this.score.goals} z ${this.score.maxShots}`, this.V_WIDTH / 2, 335);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText(`Brankář: ${this.goalieAI.config.badge} (${this.goalieAI.config.name})`, this.V_WIDTH / 2, 368);

    // Zlaté hvězdy
    const stars = this.score.goals >= 4 ? 3 : (this.score.goals >= 2 ? 2 : 1);
    ctx.font = '48px sans-serif';
    const starText = '⭐'.repeat(stars);
    ctx.fillText(starText, this.V_WIDTH / 2, 430);

    let cheerMsg = 'Výborný trénink!';
    if (this.score.goals === 5) cheerMsg = 'NEUVĚŘITELNÉ! Čisté konto pro Julinku! 🏆';
    else if (this.score.goals >= 3) cheerMsg = 'Fantastický výkon florbalové hvězdy! 🥇';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText(cheerMsg, this.V_WIDTH / 2, 485);

    // Tlačítko Hrát znovu
    ctx.fillStyle = '#ff2a6d';
    ctx.beginPath();
    ctx.roundRect(this.V_WIDTH / 2 - 130, 560, 260, 64, 32);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('HRÁT ZNOVU 🔄', this.V_WIDTH / 2, 600);

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

    if (this.mode === 'tutorial') {
      // Kliknutí na tlačítko Jít na nájezdy v tutoriálu
      if (x >= this.V_WIDTH / 2 - 140 && x <= this.V_WIDTH / 2 + 140 && y >= 840 && y <= 920) {
        this.startShootout();
      }
    } else if (this.mode === 'gameover') {
      // V režimu gameover jakýkoliv dotyk spustí novou hru
      this.startShootout();
    }
  }
}
