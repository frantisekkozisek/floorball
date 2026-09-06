import './style.css';
import { GameEngine } from './game/gameEngine';
import { soundManager } from './audio/soundEffects';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const soundToggleBtn = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
const switchModeBtn = document.getElementById('btn-switch-mode') as HTMLButtonElement;
const tipBanner = document.getElementById('tip-banner') as HTMLDivElement;

const game = new GameEngine(canvas);
switchModeBtn.innerText = '🎓 Trénink triků';
tipBanner.innerText = '✏️ Nakresli trasu k brance a Julinka po ní vyrazí!';

// Správa zvuku
const handleSoundToggle = (e?: Event) => {
  if (e) e.stopPropagation();
  soundManager.ensureAudio();
  soundManager.isMuted = !soundManager.isMuted;
  soundToggleBtn.innerText = soundManager.isMuted ? '🔇 Zvuk VYPNUT' : '🔊 Zvuk ZAPNUT';
};
soundToggleBtn.addEventListener('pointerdown', handleSoundToggle);
soundToggleBtn.addEventListener('click', handleSoundToggle);

// Přepínání mezi Akademií (tutoriálem) a Ostrými nájezdy / Nová hra
const handleSwitchMode = (e?: Event) => {
  if (e) e.stopPropagation();
  soundManager.ensureAudio();
  if (game.mode === 'gameover') {
    game.startShootout();
    switchModeBtn.innerText = '🎓 Trénink triků';
    tipBanner.innerText = '✏️ Nakresli trasu k brance a Julinka po ní vyrazí!';
  } else if (game.mode === 'tutorial') {
    game.startShootout();
    switchModeBtn.innerText = '🎓 Trénink triků';
    tipBanner.innerText = '✏️ Nakresli trasu k brance a Julinka po ní vyrazí!';
  } else {
    game.startTutorial();
    switchModeBtn.innerText = '🏆 Jít na nájezdy';
    tipBanner.innerText = '💡 Sleduj nápovědu a nauč se triky!';
  }
};
switchModeBtn.addEventListener('pointerdown', handleSwitchMode);
switchModeBtn.addEventListener('click', handleSwitchMode);

// Kliknutí na canvas pro restart po skončení hry
const handleCanvasClick = (e: MouseEvent | PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = game.V_WIDTH / (rect.width || 1);
  const scaleY = game.V_HEIGHT / (rect.height || 1);
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;
  game.handleClickAt(clickX, clickY);
};
canvas.addEventListener('click', handleCanvasClick);

// Kliknutí na spodní banner v režimu GameOver
const handleTipBannerClick = () => {
  if (game.mode === 'gameover') {
    soundManager.ensureAudio();
    game.startShootout();
  }
};
tipBanner.addEventListener('pointerdown', handleTipBannerClick);
tipBanner.addEventListener('click', handleTipBannerClick);

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

