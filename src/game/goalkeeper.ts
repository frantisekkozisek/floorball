import { Goalkeeper, Ball, TrickType, GoalDimensions, GoalieLevel, GoalieConfig } from './types';

export const GOALIE_CONFIGS: Record<GoalieLevel, GoalieConfig> = {
  junior: {
    id: 'junior',
    name: 'Začátečník',
    badge: '🟢 Junior',
    reactionTime: 0.10, // 100ms
    trackingSpeed: 230, // px/s
    diveSpeed: 440, // px/s
    bodyReach: 20, // px
    sideReach: 46, // px
    maxHeightReach: 60, // px
    deceptionDelay: 0.28, // 280ms
    jerseyColor: '#10b981', // zelený dres
    maskColor: '#34d399', // světle zelená maska
  },
  profi: {
    id: 'profi',
    name: 'Ligový brankář',
    badge: '🟡 Profi',
    reactionTime: 0.035, // 35ms
    trackingSpeed: 340, // px/s
    diveSpeed: 660, // px/s
    bodyReach: 24, // px
    sideReach: 56, // px
    maxHeightReach: 68, // px
    deceptionDelay: 0.16, // 160ms
    jerseyColor: '#ff6b00', // neonově oranžový dres
    maskColor: '#05d9e8', // tyrkysová maska
  },
  legend: {
    id: 'legend',
    name: 'Legenda (Zeď)',
    badge: '🔴 Legenda',
    reactionTime: 0.015, // 15ms
    trackingSpeed: 440, // px/s
    diveSpeed: 780, // px/s
    bodyReach: 27, // px
    sideReach: 62, // px
    maxHeightReach: 74, // px
    deceptionDelay: 0.09, // 90ms
    jerseyColor: '#8b5cf6', // fialový dres
    maskColor: '#ffe600', // zlatá maska
  },
};

export class GoalkeeperAI {
  public goalie: Goalkeeper;
  public config: GoalieConfig;
  public level: GoalieLevel = 'profi';

  private goal: GoalDimensions;
  private reactionDelayTimer: number = 0;
  private fakeDeceptionTimer: number = 0;
  private diveSpeed: number = 0;
  private targetGoalX: number;
  private baseCreaseY: number;

  constructor(goal: GoalDimensions, initialLevel: GoalieLevel = 'profi') {
    this.goal = goal;
    this.level = initialLevel;
    this.config = GOALIE_CONFIGS[initialLevel];
    this.baseCreaseY = goal.y + 26; // V brankovišti těsně před brankovou čárou
    this.targetGoalX = goal.x;
    this.goalie = {
      x: goal.x,
      y: this.baseCreaseY,
      width: 72,
      height: 74,
      vx: 0,
      targetX: goal.x,
      state: 'ready',
      saveReactionTimer: 0,
    };
  }

  public setLevel(level: GoalieLevel) {
    this.level = level;
    this.config = GOALIE_CONFIGS[level];
  }

  public getNextLevel(): GoalieLevel {
    if (this.level === 'junior') return 'profi';
    if (this.level === 'profi') return 'legend';
    return 'junior';
  }

  public reset() {
    this.goalie.x = this.goal.x;
    this.goalie.y = this.baseCreaseY;
    this.goalie.targetX = this.goal.x;
    this.targetGoalX = this.goal.x;
    this.goalie.vx = 0;
    this.goalie.state = 'ready';
    this.reactionDelayTimer = 0;
    this.fakeDeceptionTimer = 0;
    this.diveSpeed = 0;
  }

  /**
   * Reakce na vystřelení míčku
   */
  public onShotInitiated(trickType: TrickType, estimatedTargetX: number) {
    this.targetGoalX = estimatedTargetX;

    if (trickType === 'toe-drag') {
      // Florbalová stahovačka: brankář skočí na fintu na opačnou stranu!
      const deceptionOffset = (estimatedTargetX > this.goal.x ? -1 : 1) * 60;
      this.goalie.targetX = Math.max(
        this.goal.x - this.goal.width * 0.4,
        Math.min(this.goal.x + this.goal.width * 0.4, this.goal.x + deceptionOffset)
      );
      this.fakeDeceptionTimer = this.config.deceptionDelay;
      this.reactionDelayTimer = 0;
      this.diveSpeed = this.config.diveSpeed * 0.95;
    } else if (trickType === 'zorro') {
      // Zorro trik: míček stoupá do výšky v oblouku, brankář má zpoždění
      this.reactionDelayTimer = this.config.reactionTime * 2.2;
      this.goalie.targetX = estimatedTargetX;
      this.diveSpeed = this.config.diveSpeed * 0.9;
    } else {
      // Normální prudká střela: blesková reakce a prudký skok k tyči
      this.reactionDelayTimer = this.config.reactionTime;
      this.goalie.targetX = estimatedTargetX;
      this.diveSpeed = this.config.diveSpeed;
    }
  }

  /**
   * Aktualizace brankáře v každém snímku hry
   */
  public update(dt: number, ball: Ball) {
    // 1. Zpracování oklamání fintou (toe-drag)
    if (this.fakeDeceptionTimer > 0) {
      this.fakeDeceptionTimer -= dt;
      if (this.fakeDeceptionTimer <= 0) {
        // Po odeznění finty se brankář snaží vrátit k letícímu míčku
        this.goalie.targetX = this.targetGoalX;
        this.diveSpeed = this.config.diveSpeed * 0.95;
      }
    }

    if (this.reactionDelayTimer > 0) {
      this.reactionDelayTimer -= dt;
    }

    // 2. Pohyb brankáře
    if (ball.isMoving) {
      // Během letu střely: aktivní skok/přesun brankáře k cíli
      if (this.reactionDelayTimer <= 0) {
        const clampedTarget = Math.max(
          this.goal.x - this.goal.width * 0.44,
          Math.min(this.goal.x + this.goal.width * 0.44, this.goalie.targetX)
        );

        const dx = clampedTarget - this.goalie.x;
        const currentSpeed = this.diveSpeed || this.config.diveSpeed;

        if (Math.abs(dx) > 3) {
          this.goalie.vx = Math.sign(dx) * Math.min(currentSpeed, Math.abs(dx) * 14);
          this.goalie.x += this.goalie.vx * dt;
          this.goalie.state = dx > 0 ? 'save_right' : 'save_left';
        } else {
          this.goalie.vx = 0;
        }
      }
    } else {
      // Míček se ještě nestřílí (hráčka běží po hřišti nebo se připravuje):
      // Brankář aktivně vykrývá střelecký úhel podle pozice míčku a hráčky!
      const angleOffset = (ball.x - this.goal.x) * 0.44;
      const angleTarget = Math.max(
        this.goal.x - this.goal.width * 0.38,
        Math.min(this.goal.x + this.goal.width * 0.38, this.goal.x + angleOffset)
      );

      const dx = angleTarget - this.goalie.x;
      const trackingSpeed = this.config.trackingSpeed; // Přesun po kolenou

      if (Math.abs(dx) > 2) {
        this.goalie.vx = Math.sign(dx) * Math.min(trackingSpeed, Math.abs(dx) * 8);
        this.goalie.x += this.goalie.vx * dt;
        this.goalie.state = dx > 8 ? 'save_right' : (dx < -8 ? 'save_left' : 'ready');
      } else {
        this.goalie.vx = 0;
        this.goalie.state = 'ready';
      }

      // Brankář povystoupí proti blížícímu se střelci (vykrytí úhlu)
      const distFromGoal = Math.max(0, Math.min(1, (780 - ball.y) / 500));
      const forwardStep = this.level === 'legend' ? 18 : (this.level === 'profi' ? 14 : 10);
      this.goalie.y = this.baseCreaseY + distFromGoal * forwardStep;
    }
  }

  /**
   * Zjistí, zda brankář střelu zachytil / vyrazil tělem, nohou nebo rukou.
   */
  public checkSave(ball: Ball): boolean {
    if (!ball.isMoving) return false;

    // Brankář chytá v zóně těsně před a na úrovni své pozice Y
    const inSaveZone = ball.y <= this.goalie.y + 16 && ball.y >= this.goal.y - 8;
    if (!inSaveZone) return false;

    const dx = Math.abs(ball.x - this.goalie.x);

    // 1. Zásah středem těla / klečící postavy
    // Brankář tělem a maskou pokryje výšku až do z = 85
    if (dx <= this.config.bodyReach && ball.z <= 85) {
      this.goalie.state = 'beaten';
      return true;
    }

    // 2. Boční zákrok nataženou rukou nebo betonem/nohou při skoku
    // Pokud střela míří výše než dosah brankáře, brankář na ni v kleče nedosáhne!
    if (dx <= this.config.sideReach && ball.z <= this.config.maxHeightReach) {
      this.goalie.state = 'beaten';
      return true;
    }

    return false;
  }
}
