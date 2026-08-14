/**
 * Event emitter system for Munin Core.
 * Consuming applications subscribe to events to build features on top (UI sync, social, gamification).
 */

import type { ProgressEntry } from '../types/progress.js';
import type { UserRating } from '../types/ratings.js';
import type { ContributionEntry } from '../types/contributions.js';

export interface ConflictDetectedEvent {
  userId: string;
  titleId: string;
  existingDeviceId: string;
  incomingDeviceId: string;
  resolution: 'latest-wins' | 'longest-progress';
  accepted: boolean; // true if the incoming update won
}

export interface MuninEvents {
  'progress.updated': ProgressEntry;
  'progress.conflict': ConflictDetectedEvent;
  'episode.completed': ProgressEntry;
  'season.completed': { userId: string; seriesId: string; seasonNumber: number };
  'series.completed': { userId: string; seriesId: string };
  'rating.added': UserRating;
  'rating.updated': UserRating;
  'contribution.submitted': ContributionEntry;
}

type EventHandler<T> = (data: T) => void;

export class MuninEventEmitter {
  private listeners: Map<string, Set<EventHandler<unknown>>> = new Map();

  on<K extends keyof MuninEvents>(event: K, handler: EventHandler<MuninEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<unknown>);
  }

  off<K extends keyof MuninEvents>(event: K, handler: EventHandler<MuninEvents[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<unknown>);
  }

  emit<K extends keyof MuninEvents>(event: K, data: MuninEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }
  }

  removeAllListeners(event?: keyof MuninEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
