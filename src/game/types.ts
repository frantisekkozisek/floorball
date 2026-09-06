export type TrickType = 'normal' | 'toe-drag' | 'zorro';

export interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export interface ShotTarget {
  x: number;
  y: number;
  z: number;
  label: string;
  badgeColor: string;
}

export interface PartitionedStroke {
  runPath: { x: number; y: number }[];
  shotTarget: ShotTarget;
  releasePoint: { x: number; y: number };
}

export interface ShotParams {
  type: TrickType;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  curve: number; // -1 to 1 (left to right spin)
  lift: number;  // 0 to 1 (height trajectory)
}

export interface Ball {
  x: number;       // Horizontal position (pixels on virtual canvas)
  y: number;       // Vertical position (pixels on virtual canvas)
  z: number;       // Height above ground (0 = on floor)
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  rotation: number;
  isMoving: boolean;
  trail: { x: number; y: number; alpha: number }[];
}

export type GoalieLevel = 'junior' | 'profi' | 'legend';

export interface GoalieConfig {
  id: GoalieLevel;
  name: string;
  badge: string;
  reactionTime: number; // in seconds
  trackingSpeed: number; // px/s
  diveSpeed: number; // px/s
  bodyReach: number; // px
  sideReach: number; // px
  maxHeightReach: number; // px
  deceptionDelay: number; // seconds fooled by toe-drag
  jerseyColor: string;
  maskColor: string;
}

export interface Goalkeeper {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  targetX: number;
  state: 'idle' | 'ready' | 'save_left' | 'save_right' | 'beaten';
  saveReactionTimer: number;
}

export interface GoalDimensions {
  x: number;       // Center X of goal line
  y: number;       // Y coordinate of goal line
  width: number;   // Goal width (e.g. 240px)
  height: number;  // Goal height (e.g. 150px)
  postRadius: number;
}

export interface GameScore {
  shotsTotal: number;
  goals: number;
  saves: number;
  posts: number;
  currentShot: number;
  maxShots: number;
}

export type GameMode = 'tutorial' | 'shootout' | 'gameover';
