import { Goalkeeper, Ball, TrickType, GoalDimensions } from './types';

export class GoalkeeperAI {
  public goalie: Goalkeeper;
  private reactionDelayTimer: number = 0;
  private fakeDeceptionTimer: number = 0;
  private goal: GoalDimensions;

  constructor(goal: GoalDimensions) {
    this.goal = goal;
    this.goalie = {
      x: goal.x,
      y: goal.y + 35,
      width: 68,
      height: 72,
      vx: 0,
      targetX: goal.x,
      state: 'idle',
      saveReactionTimer: 0,
    };
  }

  public reset() {
    this.goalie.x = this.goal.x;
    this.goalie.targetX = this.goal.x;
    this.goalie.vx = 0;
    this.goalie.state = 'ready';
    this.reactionDelayTimer = 0;
    this.fakeDeceptionTimer = 0;
  }

  public onShotInitiated(trickType: TrickType, estimatedTargetX: number) {
    if (trickType === 'toe-drag') {
      // Brankář skočí na fintu na opačnou stranu!
      const deceptionOffset = (estimatedTargetX > this.goal.x ? -1 : 1) * 45;
      this.goalie.targetX = this.goal.x + deceptionOffset;
      this.fakeDeceptionTimer = 0.22; // Zmatení na 220ms
    } else if (trickType === 'zorro') {
      // Zorro trik zpozdí reakci brankáře, protože míček letí vzduchem
      this.reactionDelayTimer = 0.28;
      this.goalie.targetX = estimatedTargetX;
    } else {
      // Běžná střela
      this.reactionDelayTimer = 0.14;
      this.goalie.targetX = estimatedTargetX;
    }
  }

  public update(dt: number, ball: Ball) {
    if (this.fakeDeceptionTimer > 0) {
      this.fakeDeceptionTimer -= dt;
      if (this.fakeDeceptionTimer <= 0) {
        // Po odeznění finty se brankář snaží vrátit k míčku
        this.goalie.targetX = ball.x;
      }
    }

    if (this.reactionDelayTimer > 0) {
      this.reactionDelayTimer -= dt;
    } else if (ball.isMoving) {
      // Brankář koriguje pozici podle skutečné pozice míčku
      const target = Math.max(
        this.goal.x - this.goal.width * 0.42,
        Math.min(this.goal.x + this.goal.width * 0.42, this.goalie.targetX)
      );

      const dx = target - this.goalie.x;
      const speed = 210; // Rychlost přesunu po kolenou
      if (Math.abs(dx) > 4) {
        this.goalie.vx = Math.sign(dx) * Math.min(speed, Math.abs(dx) * 8);
        this.goalie.x += this.goalie.vx * dt;
        this.goalie.state = dx > 0 ? 'save_right' : 'save_left';
      } else {
        this.goalie.vx = 0;
      }
    } else {
      // Návrat do středu při klidu
      const dx = this.goal.x - this.goalie.x;
      this.goalie.x += dx * 3 * dt;
      this.goalie.state = 'ready';
    }
  }

  /**
   * Zjistí, zda brankář střelu zachytil / vyrazil tělem nebo rukou.
   */
  public checkSave(ball: Ball): boolean {
    if (!ball.isMoving) return false;

    // Kontrola kolize v Y (když míček míjí brankáře)
    const dy = Math.abs(ball.y - this.goalie.y);
    if (dy > 18) return false;

    // Šířka zákroku brankáře (tělo + vytažená ruka/noha)
    const reach = this.goalie.width * 0.65;
    const dx = Math.abs(ball.x - this.goalie.x);

    // Výška dosahu brankáře (pokud míček letí příliš vysoko do vinklu, brankář v kleče na něj nedosáhne!)
    const maxHeightReach = this.goalie.height * 0.85;

    if (dx <= reach && ball.z <= maxHeightReach) {
      this.goalie.state = 'beaten';
      return true;
    }

    return false;
  }
}
