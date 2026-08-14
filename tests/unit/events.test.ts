import { describe, it, expect, vi } from 'vitest';
import { MuninEventEmitter } from '../../src/core/events.js';

describe('MuninEventEmitter', () => {
  it('on/off/emit basic functionality', () => {
    const emitter = new MuninEventEmitter();
    const handler = vi.fn();

    emitter.on('progress.updated', handler);
    emitter.emit('progress.updated', { userId: 'u1', titleId: 't1' } as any);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ userId: 'u1', titleId: 't1' });

    emitter.off('progress.updated', handler);
    emitter.emit('progress.updated', { userId: 'u1', titleId: 't2' } as any);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners on same event', () => {
    const emitter = new MuninEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('rating.added', handler1);
    emitter.on('rating.added', handler2);
    emitter.emit('rating.added', { userId: 'u1', titleId: 't1' } as any);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('off removes only specific listener', () => {
    const emitter = new MuninEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('episode.completed', handler1);
    emitter.on('episode.completed', handler2);

    emitter.off('episode.completed', handler1);
    emitter.emit('episode.completed', { userId: 'u1', titleId: 'ep1' } as any);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('emit with no listeners does not throw', () => {
    const emitter = new MuninEventEmitter();

    expect(() => {
      emitter.emit('series.completed', { userId: 'u1', seriesId: 's1' });
    }).not.toThrow();
  });

  it('removeAllListeners clears all handlers for an event', () => {
    const emitter = new MuninEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('progress.updated', handler1);
    emitter.on('progress.updated', handler2);

    emitter.removeAllListeners('progress.updated');
    emitter.emit('progress.updated', { userId: 'u1', titleId: 't1' } as any);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('removeAllListeners with no argument clears everything', () => {
    const emitter = new MuninEventEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('progress.updated', handler1);
    emitter.on('rating.added', handler2);

    emitter.removeAllListeners();
    emitter.emit('progress.updated', { userId: 'u1', titleId: 't1' } as any);
    emitter.emit('rating.added', { userId: 'u1', titleId: 't1' } as any);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});
