/**
 * Web Audio API syntetizér florbalových zvuků.
 * Funguje 100% offline a s nulovou latencí na mobilech.
 */

class SoundManager {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public ensureAudio() {
    this.init();
  }

  /** Zvuk klepnutí florbalky o děravý plastový míček */
  public playStickHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Rychlý perkusivní úder s plastickým zabarvením
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.06);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.08);

    // Doplňkový šumový cvaknutí plastu
    this.playNoiseClick(0.03, 0.4);
  }

  /** Zvuk cinknutí o tyčku nebo břevno florbalové branky */
  public playPostHit() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    // Dva harmonické vysoké tóny pro kovový cink
    osc1.frequency.setValueAtTime(1860, t);
    osc2.frequency.setValueAtTime(2480, t);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.6);
    osc2.stop(t + 0.6);
  }

  /**
   * Zvuk gólu:
   * 1. Hluboký úder do sítě (tlumený náraz míčku do síťoviny branky)
   * 2. Mohutná plná halová siréna (filtrovaný akord s rezonancí namísto plechové trumpetky)
   * 3. Radostná vítězná znělka (jiskřivý arpeggio akord zvonků)
   * 4. Nadšený potlesk a jásot publika
   */
  public playGoalHorn() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. Zvuk vletu míčku a napnutí sítě (net impact thud)
    const netOsc = this.ctx.createOscillator();
    const netGain = this.ctx.createGain();
    netOsc.type = 'sine';
    netOsc.frequency.setValueAtTime(160, t);
    netOsc.frequency.exponentialRampToValueAtTime(36, t + 0.12);
    netGain.gain.setValueAtTime(0.7, t);
    netGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    netOsc.connect(netGain);
    netGain.connect(this.ctx.destination);
    netOsc.start(t);
    netOsc.stop(t + 0.15);

    // Šustění sítě (krátký filtrovaný šum)
    this.playNoiseClick(0.08, 0.35);

    // 2. Mohutný halový akord sirény (F-dur / C-dur harmonie)
    // Tóny: F3 (174.61 Hz), C4 (261.63 Hz), F4 (349.23 Hz)
    // Prohnané lowpass filtrem pro odstranění bzučivého plechového zvuku
    const hornFreqs = [174.61, 261.63, 349.23];
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(720, t);
    filter.frequency.linearRampToValueAtTime(850, t + 0.4);
    filter.frequency.exponentialRampToValueAtTime(450, t + 1.2);
    filter.Q.setValueAtTime(2.2, t);

    const hornMasterGain = this.ctx.createGain();
    // Nástup se stoupajícím náběhem, mohutné tělo, dozvuk
    hornMasterGain.gain.setValueAtTime(0.001, t);
    hornMasterGain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    hornMasterGain.gain.setValueAtTime(0.5, t + 0.85);
    hornMasterGain.gain.exponentialRampToValueAtTime(0.001, t + 1.25);

    filter.connect(hornMasterGain);
    hornMasterGain.connect(this.ctx.destination);

    hornFreqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      // Dva oscilátory s mírným detuningem pro bohatý prostorový sborový zvuk
      const oscSaw = this.ctx.createOscillator();
      const oscTri = this.ctx.createOscillator();
      oscSaw.type = 'sawtooth';
      oscTri.type = 'triangle';

      const detune = idx === 1 ? 5 : -5;
      oscSaw.frequency.setValueAtTime(freq, t);
      oscSaw.detune.setValueAtTime(detune, t);
      oscTri.frequency.setValueAtTime(freq, t);

      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(0.25, t);

      oscSaw.connect(voiceGain);
      oscTri.connect(voiceGain);
      voiceGain.connect(filter);

      oscSaw.start(t);
      oscTri.start(t);
      oscSaw.stop(t + 1.3);
      oscTri.stop(t + 1.3);
    });

    // 3. Jiskřivé vítězné zvonky (arpeggio v tónině F dur: F5, A5, C6, F6)
    const chimes = [698.46, 880.00, 1046.50, 1396.91];
    chimes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const chimeOsc = this.ctx.createOscillator();
      const chimeGain = this.ctx.createGain();
      const startTime = t + 0.08 + idx * 0.08;

      chimeOsc.type = 'triangle';
      chimeOsc.frequency.setValueAtTime(freq, startTime);

      chimeGain.gain.setValueAtTime(0.3, startTime);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(this.ctx.destination);

      chimeOsc.start(startTime);
      chimeOsc.stop(startTime + 0.38);
    });

    // 4. Okamžitý bouřlivý potlesk a jásot publika
    setTimeout(() => this.playCheer(), 80);
  }

  /** Hvizd florbalové píšťalky rozhodčího */
  public playWhistle() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(2800, t + 0.05);
    osc.frequency.exponentialRampToValueAtTime(2500, t + 0.15);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Zvuk vyražení / chycení míčku brankářem */
  public playSave() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Potlesk a jásot publika */
  public playCheer() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.8));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  /** Švihnutí vzduchem (speciální trik / zorro) */
  public playWhoosh() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.25);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Zvuk přepnutí úrovně brankáře (vzestupný akord) */
  public playLevelUp() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = t + idx * 0.07;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.35, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  /** Zvuk magnetického uzamčení kapsy v brance (krátký uspokojivý klik) */
  public playAimSnap() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.04);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }

  private playNoiseClick(duration: number, volume: number) {
    if (!this.ctx) return;
    const count = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, count, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }
}

export const soundManager = new SoundManager();
