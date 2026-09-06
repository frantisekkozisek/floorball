import './style.css';
import { GameEngine } from './game/gameEngine';
import { soundManager } from './audio/soundEffects';
import { JERSEY_COLORS } from './game/scoring';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const soundToggleBtn = document.getElementById('btn-sound-toggle') as HTMLButtonElement;
const goalieLevelBtn = document.getElementById('btn-goalie-level') as HTMLButtonElement;
const switchModeBtn = document.getElementById('btn-switch-mode') as HTMLButtonElement;
const tipBanner = document.getElementById('tip-banner') as HTMLDivElement;
const playerCustomBtn = document.getElementById('btn-player-custom') as HTMLButtonElement;

// Prvky modálního okna pro úpravu hráče
const playerModal = document.getElementById('player-modal') as HTMLDivElement;
const modalBackdrop = document.getElementById('modal-backdrop') as HTMLDivElement;
const closeModalBtn = document.getElementById('btn-close-modal') as HTMLButtonElement;
const playerNameInput = document.getElementById('input-player-name') as HTMLInputElement;
const playerNumberInput = document.getElementById('input-player-number') as HTMLInputElement;
const numDecBtn = document.getElementById('btn-num-dec') as HTMLButtonElement;
const numIncBtn = document.getElementById('btn-num-inc') as HTMLButtonElement;
const colorSwatchesContainer = document.getElementById('color-swatches') as HTMLDivElement;
const savePlayerBtn = document.getElementById('btn-save-player') as HTMLButtonElement;
const previewJersey = document.getElementById('preview-jersey') as HTMLDivElement;
const previewName = document.getElementById('preview-name') as HTMLDivElement;
const previewNumber = document.getElementById('preview-number') as HTMLDivElement;

const game = new GameEngine(canvas);
switchModeBtn.innerText = '🎓 Trénink triků';
tipBanner.innerText = '🎯 Zamiř do branky – zámek sám zacvakne do vinklu ⭐ nebo břevna 🚀! (mířidlo je 5 cm nad prstem)';

// Aktualizace tlačítka hráče
const updatePlayerButton = () => {
  if (!playerCustomBtn) return;
  const cfg = game.getPlayerConfig();
  playerCustomBtn.innerText = `👕 ${cfg.name} #${cfg.number}`;
  playerCustomBtn.style.borderColor = cfg.jerseyColor;
};
updatePlayerButton();

// Správa modálního okna hráče
let selectedJerseyColor = game.playerConfig.jerseyColor;

const updateModalPreview = () => {
  const nameVal = (playerNameInput.value || 'JULINKA').trim().slice(0, 10).toUpperCase();
  const numVal = Math.max(1, Math.min(99, parseInt(playerNumberInput.value, 10) || 7));
  if (previewName) previewName.innerText = nameVal;
  if (previewNumber) previewNumber.innerText = numVal.toString();
  if (previewJersey) previewJersey.style.backgroundColor = selectedJerseyColor;

  // Zvýraznění aktivní barvy
  if (colorSwatchesContainer) {
    const swatches = colorSwatchesContainer.querySelectorAll('.color-swatch');
    swatches.forEach(sw => {
      const hex = sw.getAttribute('data-color');
      if (hex === selectedJerseyColor) {
        sw.classList.add('active');
      } else {
        sw.classList.remove('active');
      }
    });
  }
};

// Vygenerování vzorníku barev dresů
if (colorSwatchesContainer) {
  colorSwatchesContainer.innerHTML = '';
  JERSEY_COLORS.forEach(c => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = c.hex;
    swatch.title = c.name;
    swatch.setAttribute('data-color', c.hex);
    swatch.addEventListener('click', () => {
      selectedJerseyColor = c.hex;
      updateModalPreview();
    });
    colorSwatchesContainer.appendChild(swatch);
  });
}

const openPlayerModal = () => {
  soundManager.ensureAudio();
  const cfg = game.getPlayerConfig();
  if (playerNameInput) playerNameInput.value = cfg.name;
  if (playerNumberInput) playerNumberInput.value = cfg.number.toString();
  selectedJerseyColor = cfg.jerseyColor;
  updateModalPreview();
  if (playerModal) playerModal.classList.remove('hidden');
};

const closePlayerModal = () => {
  if (playerModal) playerModal.classList.add('hidden');
};

// Callback z canvasu na otevření modálu (např. z GameOver obrazovky)
game.onOpenPlayerModal = () => openPlayerModal();

if (playerCustomBtn) {
  playerCustomBtn.addEventListener('click', openPlayerModal);
}
if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closePlayerModal);
}
if (modalBackdrop) {
  modalBackdrop.addEventListener('click', closePlayerModal);
}

if (playerNameInput) {
  playerNameInput.addEventListener('input', updateModalPreview);
}
if (playerNumberInput) {
  playerNumberInput.addEventListener('input', updateModalPreview);
}

if (numDecBtn && playerNumberInput) {
  numDecBtn.addEventListener('click', () => {
    const current = parseInt(playerNumberInput.value, 10) || 7;
    playerNumberInput.value = Math.max(1, current - 1).toString();
    updateModalPreview();
  });
}

if (numIncBtn && playerNumberInput) {
  numIncBtn.addEventListener('click', () => {
    const current = parseInt(playerNumberInput.value, 10) || 7;
    playerNumberInput.value = Math.min(99, current + 1).toString();
    updateModalPreview();
  });
}

if (savePlayerBtn) {
  savePlayerBtn.addEventListener('click', () => {
    soundManager.ensureAudio();
    const newName = (playerNameInput.value || 'JULINKA').trim().slice(0, 10).toUpperCase();
    const newNum = Math.max(1, Math.min(99, parseInt(playerNumberInput.value, 10) || 7));
    game.setPlayerConfig({
      name: newName,
      number: newNum,
      jerseyColor: selectedJerseyColor,
    });
    updatePlayerButton();
    closePlayerModal();
    soundManager.playLevelUp();
  });
}

const updateGoalieButtonLabel = () => {
  if (!goalieLevelBtn) return;
  const cfg = game.getGoalieConfig();
  goalieLevelBtn.innerText = `🧤 ${cfg.badge}`;
};
updateGoalieButtonLabel();

// Správa zvuku s ochranou proti dvojkliku (pointerdown + click)
let lastSoundTime = 0;
const handleSoundToggle = (e?: Event) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const now = performance.now();
  if (now - lastSoundTime < 350) return;
  lastSoundTime = now;

  soundManager.ensureAudio();
  soundManager.isMuted = !soundManager.isMuted;
  soundToggleBtn.innerText = soundManager.isMuted ? '🔇 Zvuk VYPNUT' : '🔊 Zvuk';
};
soundToggleBtn.addEventListener('pointerdown', handleSoundToggle);
soundToggleBtn.addEventListener('click', handleSoundToggle);

// Přepínání obtížnosti brankáře (Junior / Profi / Legenda)
let lastGoalieLevelTime = 0;
const handleGoalieLevelToggle = (e?: Event) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const now = performance.now();
  if (now - lastGoalieLevelTime < 350) return;
  lastGoalieLevelTime = now;

  soundManager.ensureAudio();
  game.cycleGoalieLevel();
  updateGoalieButtonLabel();
};
if (goalieLevelBtn) {
  goalieLevelBtn.addEventListener('pointerdown', handleGoalieLevelToggle);
  goalieLevelBtn.addEventListener('click', handleGoalieLevelToggle);
}

// Přepínání mezi Akademií (tutoriálem) a Ostrými nájezdy / Nová hra
let lastSwitchTime = 0;
const handleSwitchMode = (e?: Event) => {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const now = performance.now();
  if (now - lastSwitchTime < 350) return;
  lastSwitchTime = now;

  soundManager.ensureAudio();
  if (game.mode === 'gameover' || game.mode === 'tutorial') {
    game.startShootout();
    switchModeBtn.innerText = '🎓 Trénink triků';
    tipBanner.innerText = '🎯 Zamiř do branky – zámek sám zacvakne do vinklu ⭐ nebo břevna 🚀! (mířidlo je 5 cm nad prstem)';
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
  if (playerCustomBtn) {
    updatePlayerButton();
  }
};
canvas.addEventListener('pointerdown', handleCanvasClick);
canvas.addEventListener('click', handleCanvasClick);

// Kliknutí na spodní banner v režimu GameOver
const handleTipBannerClick = () => {
  if (game.mode === 'gameover') {
    game.startShootout();
    switchModeBtn.innerText = '🎓 Trénink triků';
    tipBanner.innerText = '🎯 Zamiř do branky – zámek sám zacvakne do vinklu ⭐ nebo břevna 🚀! (mířidlo je 5 cm nad prstem)';
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
      tipBanner.innerText = '🎯 Zamiř do branky – zámek sám zacvakne do vinklu ⭐ nebo břevna 🚀! (mířidlo je 5 cm nad prstem)';
    } else if (game.mode === 'gameover') {
      switchModeBtn.innerText = '🔄 Nová hra';
      tipBanner.innerText = '🎉 Zápas skončil! Klepni pro další nájezdy!';
    }
  }

  const currentGoalieLevel = game.getGoalieLevel();
  if (currentGoalieLevel !== lastGoalieLevel) {
    lastGoalieLevel = currentGoalieLevel;
    updateGoalieButtonLabel();
  }

  requestAnimationFrame(gameLoop);
}

let lastGoalieLevel = '';
requestAnimationFrame(gameLoop);

