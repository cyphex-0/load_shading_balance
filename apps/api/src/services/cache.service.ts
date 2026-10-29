import { logger } from '../utils/logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private inMemoryCache: Map<string, CacheEntry<any>> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.inMemoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.inMemoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<void> {
    this.inMemoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  async del(key: string): Promise<void> {
    this.inMemoryCache.delete(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
    for (const key of this.inMemoryCache.keys()) {
      if (regex.test(key)) {
        this.inMemoryCache.delete(key);
      }
    }
  }

  // Pre-configured cache keys
  getScheduleKey(feederId: string, date: string): string {
    return `schedules:published:${feederId}:${date}`;
  }

  getPublicScheduleKey(date: string, zoneId?: string, feederId?: string): string {
    return `schedules:public:${date}:${zoneId || 'all'}:${feederId || 'all'}`;
  }

  getGridStatusKey(zoneId?: string): string {
    return zoneId ? `grid:status:${zoneId}` : 'grid:status:all';
  }
}

export const cacheService = new CacheService();

