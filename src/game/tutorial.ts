import { TrickType } from './types';

export interface TutorialStep {
  id: number;
  trick: TrickType;
  title: string;
  subtitle: string;
  instruction: string;
  guidePoints: { x: number; y: number }[];
  completed: boolean;
}

export class TutorialManager {
  public currentStepIndex: number = 0;
  public steps: TutorialStep[] = [];
  public isCompleted: boolean = false;
  private animTimer: number = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    const cx = canvasWidth / 2;
    const startY = canvasHeight * 0.76;
    const endY = canvasHeight * 0.32;

    this.steps = [
      {
        id: 1,
        trick: 'normal',
        title: 'Krok 1: Základní náběh & střela',
        subtitle: 'Nakresli čáru přímo k brance',
        instruction: 'Nakresli prstem trasu od Julinky rovně k brance!',
        guidePoints: [
          { x: cx, y: startY },
          { x: cx, y: (startY + endY) / 2 },
          { x: cx, y: endY },
        ],
        completed: false,
      },
      {
        id: 2,
        trick: 'toe-drag',
        title: 'Krok 2: Florbalová stahovačka',
        subtitle: 'Uskoč do strany a pak k tyčce',
        instruction: 'Nakresli trasu s úskokem doprava a pak do branky!',
        guidePoints: [
          { x: cx, y: startY },
          { x: cx + 65, y: startY - 15 },
          { x: cx - 40, y: endY },
        ],
        completed: false,
      },
      {
        id: 3,
        trick: 'zorro',
        title: 'Krok 3: Slavný ZORRO trik!',
        subtitle: 'Velký oblouk do horní šibenice',
        instruction: 'Nakresli plynulý velký oblouk pro zvednutí míčku do vinklu!',
        guidePoints: [
          { x: cx, y: startY },
          { x: cx - 75, y: startY - 80 },
          { x: cx - 50, y: endY + 20 },
          { x: cx + 55, y: endY },
        ],
        completed: false,
      },
    ];
  }

  public getCurrentStep(): TutorialStep | null {
    if (this.currentStepIndex >= this.steps.length) return null;
    return this.steps[this.currentStepIndex];
  }

  public update(dt: number) {
    this.animTimer += dt * 1.5;
  }

  /**
   * Ověří, zda Julinka provedla trik požadovaný v aktuálním kroku.
   */
  public checkTrickSuccess(performedTrick: TrickType): boolean {
    const step = this.getCurrentStep();
    if (!step) return false;

    if (step.trick === performedTrick) {
      step.completed = true;
      this.currentStepIndex++;
      if (this.currentStepIndex >= this.steps.length) {
        this.isCompleted = true;
      }
      return true;
    }
    return false;
  }

  /**
   * Vykreslí animovaného průvodce gestem (svítící křivka a animovaná ruka/prst).
   */
  public drawGuide(ctx: CanvasRenderingContext2D) {
    const step = this.getCurrentStep();
    if (!step || this.isCompleted) return;

    ctx.save();
    const pts = step.guidePoints;

    // Vykreslení svítící vodicí dráhy
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = 'rgba(5, 217, 232, 0.45)';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.strokeStyle = '#05d9e8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Animovaný prstík / ukazovátko pohybující se po křivce
    const progress = (this.animTimer % 1.8) / 1.8; // 0..1
    const handPos = this.getPointAlongPath(pts, progress);

    ctx.fillStyle = '#ff2a6d';
    ctx.shadowColor = '#ff2a6d';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(handPos.x, handPos.y, 14, 0, Math.PI * 2);
    ctx.fill();

    // Pulzující kruh kolem prstu
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(handPos.x, handPos.y, 18 + Math.sin(this.animTimer * 6) * 4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private getPointAlongPath(pts: { x: number; y: number }[], progress: number): { x: number; y: number } {
    if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
    const totalSegments = pts.length - 1;
    const scaled = progress * totalSegments;
    const segIndex = Math.min(Math.floor(scaled), totalSegments - 1);
    const segT = scaled - segIndex;

    const pA = pts[segIndex];
    const pB = pts[segIndex + 1];
    return {
      x: pA.x + (pB.x - pA.x) * segT,
      y: pA.y + (pB.y - pA.y) * segT,
    };
  }

  public reset() {
    this.currentStepIndex = 0;
    this.isCompleted = false;
    for (const step of this.steps) {
      step.completed = false;
    }
  }
}
