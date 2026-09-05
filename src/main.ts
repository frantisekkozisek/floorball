import './style.css';
import { GameEngine } from './game/gameEngine';
import { soundManager } from './audio/soundEffects';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const soundToggleBtn = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
const switchModeBtn = document.getElementById('btn-switch-mode') as HTMLButtonElement;
const tipBanner = document.getElementById('tip-banner') as HTMLDivElement;

const game = new GameEngine(canvas);

// Správa zvuku
soundToggleBtn.addEventListener('click', () => {
  soundManager.isMuted = !soundManager.isMuted;
  soundToggleBtn.innerText = soundManager.isMuted ? '🔇 Zvuk VYPNUT' : '🔊 Zvuk ZAPNUT';
});

// Přepínání mezi Akademií (tutoriálem) a Ostrými nájezdy
switchModeBtn.addEventListener('click', () => {
  if (game.mode === 'tutorial') {
    game.startShootout();
    switchModeBtn.innerText = '🎓 Trénink triků';
    tipBanner.innerText = '⚡ Přejeď prstem na branku pro střelu nebo kličku!';
  } else {
    game.startTutorial();
    switchModeBtn.innerText = '🏆 Jít na nájezdy';
    tipBanner.innerText = '💡 Sleduj animovaný prstík a nauč se triky!';
  }
});

// Kliknutí na canvas pro restart po skončení hry
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = game.V_WIDTH / rect.width;
  const scaleY = game.V_HEIGHT / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;
  game.handleClickAt(clickX, clickY);
});

// Herní smyčka (60 FPS)
let lastTime = performance.now();
let lastSyncedMode = '';

function gameLoop(currentTime: number) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  game.update(dt);
  game.render();

  if (game.mode !== lastSyncedMode) {
    lastSyncedMode = game.mode;
    if (game.mode === 'tutorial') {
      switchModeBtn.innerText = '🏆 Jít na nájezdy';
      tipBanner.innerText = '✏️ Nakresli prstem trasu a Julinka po ní poběží!';
    } else if (game.mode === 'shootout') {
      switchModeBtn.innerText = '🎓 Trénink triků';
      tipBanner.innerText = '✏️ Nakresli trasu k brance a Julinka po ní vyrazí!';
    } else if (game.mode === 'gameover') {
      switchModeBtn.innerText = '🔄 Nová hra';
      tipBanner.innerText = '🎉 Zápas skončil! Klepni pro další nájezdy!';
    }
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

