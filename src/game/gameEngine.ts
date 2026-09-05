import { Ball, GameScore, GameMode, GoalDimensions, TouchPoint, TrickType } from './types';
import { analyzeGesture, checkGoalCollision, updateBallPhysics } from './physics';
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

  public mode: GameMode = 'tutorial';
  public score: GameScore = {
    shotsTotal: 0,
    goals: 0,
    saves: 0,
    posts: 0,
    currentShot: 1,
    maxShots: 5,
  };

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
    this.showBanner('1. NÁJEZD!', 'Ukaž brankáři své triky!', '#00ffcc', 1.8);
    soundManager.playWhistle();
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
      this.isPointerDown = true;
      this.touchPoints = [{ x: pos.x, y: pos.y, time: performance.now() }];

      // Zkontrolujeme, zda uživatel nekliknul na tlačítko "Přeskočit trénink"
      if (this.mode === 'tutorial') {
        if (pos.x >= this.V_WIDTH / 2 - 140 && pos.x <= this.V_WIDTH / 2 + 140 && pos.y >= 850 && pos.y <= 910) {
          this.startShootout();
          this.isPointerDown = false;
          return;
        }
      }

      // Pokud míček stojí, okamžitě reagujeme a hráč i míček se přizpůsobí
      if (!this.ball.isMoving) {
        this.playerX = Math.max(90, Math.min(this.V_WIDTH - 90, pos.x));
        this.playerY = Math.max(520, Math.min(840, pos.y + 40));
        this.ball.x = this.playerX + 16;
        this.ball.y = this.playerY - 35;
      }
    };

    const onMove = (pos: { x: number; y: number }) => {
      if (!this.isPointerDown) return;
      const now = performance.now();
      this.touchPoints.push({ x: pos.x, y: pos.y, time: now });

      if (!this.ball.isMoving) {
        // Hráčka a míček aktivně sledují prst na displeji
        this.playerX = Math.max(90, Math.min(this.V_WIDTH - 90, pos.x));
        this.playerY = Math.max(520, Math.min(840, pos.y + 40));
        this.ball.x = this.playerX + 16;
        this.ball.y = this.playerY - 35;

        // Kmitání hokejky a zvuk driblingu
        this.stickAngle = -0.35 + Math.sin(now * 0.018) * 0.22;
        if (now - this.lastDribbleSoundTime > 260) {
          soundManager.playStickHit();
          this.lastDribbleSoundTime = now;
        }
      }
    };

    const onEnd = (pos: { x: number; y: number }) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.touchPoints.push({ x: pos.x, y: pos.y, time: performance.now() });

      if (!this.ball.isMoving && this.touchPoints.length >= 1) {
        this.attemptShot(pos);
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

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resize(), 100);
    });
  }

  public resize() {
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

  private attemptShot(releasePos?: { x: number; y: number }) {
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

  public update(dt: number) {
    this.particles.update(dt);
    this.tutorial.update(dt);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
    }

    // Plynulý návrat hokejky
    this.stickAngle += (this.stickTargetAngle - this.stickAngle) * 12 * dt;

    if (this.ball.isMoving) {
      updateBallPhysics(this.ball, dt, this.goal.y);
      this.goalieAI.update(dt, this.ball);

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
    this.drawPlayer(ctx);
    this.drawBall(ctx);
    this.particles.draw(ctx);
    this.drawSwipeTrail(ctx);

    if (this.isPointerDown && !this.ball.isMoving) {
      this.drawAimingGuide(ctx);
    }

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
   * Vykreslení míření a okamžité vizuální odezvy na pohyb prstu
   */
  private drawAimingGuide(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Zářící kruh a zpráva pod prstem
    const touchX = this.touchPoints.length > 0 ? this.touchPoints[this.touchPoints.length - 1].x : this.ball.x;
    const touchY = this.touchPoints.length > 0 ? this.touchPoints[this.touchPoints.length - 1].y : this.ball.y;

    ctx.strokeStyle = '#05d9e8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(touchX, touchY, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(5, 217, 232, 0.2)';
    ctx.fill();

    // 2. Trajektorie míření od míčku k brance
    const targetGoalX = Math.max(
      this.goal.x - this.goal.width * 0.44,
      Math.min(this.goal.x + this.goal.width * 0.44, this.ball.x)
    );

    ctx.strokeStyle = 'rgba(255, 230, 0, 0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(this.ball.x, this.ball.y);
    ctx.lineTo(targetGoalX, this.goal.y + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Cílový terč v brance
    ctx.fillStyle = '#ff2a6d';
    ctx.beginPath();
    ctx.arc(targetGoalX, this.goal.y + 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Instrukce pro odpal
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(this.V_WIDTH / 2 - 120, this.V_HEIGHT - 90, 240, 36, 18);
    ctx.fill();
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#00ffcc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('👆 PUST PRO STŘELU / ŠVIHNI!', this.V_WIDTH / 2, this.V_HEIGHT - 67);

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

    // Stín brankáře
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, gl.width * 0.6, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chrániče kolen a nohy v kleče
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-32, -18, 26, 18);
    ctx.fillRect(6, -18, 26, 18);

    // Brankářský dres (vysoká viditelnost - neonově oranžová)
    ctx.fillStyle = '#ff6b00';
    ctx.beginPath();
    ctx.roundRect(-26, -55, 52, 42, [8, 8, 4, 4]);
    ctx.fill();

    // Ruce brankáře s florbalovými rukavicemi
    ctx.fillStyle = '#0f172a';
    const armTilt = gl.state === 'save_left' ? -15 : (gl.state === 'save_right' ? 15 : 0);
    // Levá ruka
    ctx.fillRect(-38, -48 + armTilt, 12, 28);
    ctx.fillStyle = '#ffffff'; // rukavice
    ctx.beginPath();
    ctx.arc(-32, -20 + armTilt, 8, 0, Math.PI * 2);
    ctx.fill();

    // Pravá ruka
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(26, -48 - armTilt, 12, 28);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, -20 - armTilt, 8, 0, Math.PI * 2);
    ctx.fill();

    // Brankářská maska s mřížkou
    ctx.fillStyle = '#05d9e8';
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

    ctx.restore();
  }

  /**
   * Vykreslení postavičky Julinky s hokejkou
   */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.playerX, this.playerY);

    // Stín hráčky
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 45, 35, 14, 0, 0, Math.PI * 2);
    ctx.fill();

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
    const renderY = b.y - b.z * scale;

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
   * Vykreslení stopy prstu / swipu
   */
  private drawSwipeTrail(ctx: CanvasRenderingContext2D) {
    if (this.touchPoints.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.touchPoints[0].x, this.touchPoints[0].y);
    for (let i = 1; i < this.touchPoints.length; i++) {
      ctx.lineTo(this.touchPoints[i].x, this.touchPoints[i].y);
    }
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 12;
    ctx.stroke();
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
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`NÁJEZD ${this.score.currentShot} / ${this.score.maxShots}`, 40, 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#00ffcc';
      ctx.fillText(`GÓLY: ${this.score.goals}`, this.V_WIDTH - 40, 52);
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
    ctx.fillText(`Vstřelené góly: ${this.score.goals} z ${this.score.maxShots}`, this.V_WIDTH / 2, 340);

    // Zlaté hvězdy
    const stars = this.score.goals >= 4 ? 3 : (this.score.goals >= 2 ? 2 : 1);
    ctx.font = '50px sans-serif';
    const starText = '⭐'.repeat(stars);
    ctx.fillText(starText, this.V_WIDTH / 2, 420);

    let cheerMsg = 'Výborný trénink!';
    if (this.score.goals === 5) cheerMsg = 'NEUVĚŘITELNÉ! Čisté konto pro Julinku! 🏆';
    else if (this.score.goals >= 3) cheerMsg = 'Fantastický výkon florbalové hvězdy! 🥇';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#00ffcc';
    ctx.fillText(cheerMsg, this.V_WIDTH / 2, 480);

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
    if (this.mode === 'tutorial') {
      // Kliknutí na tlačítko Jít na nájezdy v tutoriálu
      if (x >= this.V_WIDTH / 2 - 130 && x <= this.V_WIDTH / 2 + 130 && y >= 855 && y <= 901) {
        this.startShootout();
      }
    } else if (this.mode === 'gameover') {
      // Kliknutí na tlačítko Hrát znovu
      if (x >= this.V_WIDTH / 2 - 130 && x <= this.V_WIDTH / 2 + 130 && y >= 560 && y <= 624) {
        this.startShootout();
      }
    }
  }
}
