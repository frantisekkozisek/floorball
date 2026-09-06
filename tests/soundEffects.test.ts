import { describe, it, expect, beforeEach, vi } from 'vitest';
import { soundManager } from '../src/audio/soundEffects';

describe('SoundManager (Web Audio API zvukový syntezátor)', () => {
  let createdOscillators: any[] = [];
  let createdGains: any[] = [];
  let createdFilters: any[] = [];
  let createdBufferSources: any[] = [];

  class MockAudioParam {
    value = 0;
    setValueAtTime = vi.fn();
    exponentialRampToValueAtTime = vi.fn();
    linearRampToValueAtTime = vi.fn();
  }

  class MockAudioNode {
    connect = vi.fn();
    disconnect = vi.fn();
  }

  class MockOscillator extends MockAudioNode {
    type = 'sine';
    frequency = new MockAudioParam();
    detune = new MockAudioParam();
    start = vi.fn();
    stop = vi.fn();
  }

  class MockGain extends MockAudioNode {
    gain = new MockAudioParam();
  }

  class MockBiquadFilter extends MockAudioNode {
    type = 'lowpass';
    frequency = new MockAudioParam();
    Q = new MockAudioParam();
  }

  class MockBufferSource extends MockAudioNode {
    buffer: any = null;
    start = vi.fn();
    stop = vi.fn();
  }

  class MockAudioContext {
    currentTime = 0;
    sampleRate = 44100;
    state = 'running';
    destination = new MockAudioNode();

    createOscillator() {
      const osc = new MockOscillator();
      createdOscillators.push(osc);
      return osc;
    }

    createGain() {
      const gain = new MockGain();
      createdGains.push(gain);
      return gain;
    }

    createBiquadFilter() {
      const filter = new MockBiquadFilter();
      createdFilters.push(filter);
      return filter;
    }

    createBuffer(channels: number, length: number, sampleRate: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }

    createBufferSource() {
      const source = new MockBufferSource();
      createdBufferSources.push(source);
      return source;
    }

    resume = vi.fn().mockResolvedValue(undefined);
  }

  beforeEach(() => {
    createdOscillators = [];
    createdGains = [];
    createdFilters = [];
    createdBufferSources = [];

    (globalThis as any).window = globalThis;
    (globalThis as any).AudioContext = MockAudioContext;
    (soundManager as any).ctx = null;
    soundManager.isMuted = false;
  });

  it('nevygeneruje žádný zvuk, pokud je isMuted = true', () => {
    soundManager.isMuted = true;
    soundManager.playGoalHorn();

    expect(createdOscillators.length).toBe(0);
    expect(createdGains.length).toBe(0);
  });

  it('playGoalHorn zahraje bohatou vícesložkovou oslavnou sekvenci namísto laciné trumpetky', () => {
    vi.useFakeTimers();

    soundManager.playGoalHorn();

    // 1. Zvuk vletu míčku do sítě (netOsc)
    expect(createdOscillators.length).toBeGreaterThan(0);
    const netOsc = createdOscillators[0];
    expect(netOsc.type).toBe('sine');
    expect(netOsc.frequency.setValueAtTime).toHaveBeenCalledWith(160, 0);

    // 2. Biquad filter pro halovou rezonanci a potlačení bzučivých frekvencí
    expect(createdFilters.length).toBeGreaterThan(0);
    const filter = createdFilters[0];
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(720, 0);

    // 3. Oslavné zvonky (chimes) a sirénové oscilátory
    const hasSaw = createdOscillators.some((o: any) => o.type === 'sawtooth');
    const hasTri = createdOscillators.some((o: any) => o.type === 'triangle');
    expect(hasSaw).toBe(true);
    expect(hasTri).toBe(true);

    // 4. Po 80ms se spustí jásot diváků (playCheer)
    const bufferCountBefore = createdBufferSources.length;
    vi.advanceTimersByTime(100);
    expect(createdBufferSources.length).toBeGreaterThan(bufferCountBefore);

    vi.useRealTimers();
  });

  it('spolehlivě přehraje ostatní herní zvuky bez pádů', () => {
    expect(() => {
      soundManager.playStickHit();
      soundManager.playPostHit();
      soundManager.playWhistle();
      soundManager.playSave();
      soundManager.playWhoosh();
      soundManager.playLevelUp();
    }).not.toThrow();
  });
});
