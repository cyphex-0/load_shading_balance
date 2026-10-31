import { logger } from './logger';

export interface LockLease {
  key: string;
  ownerId: string;
  acquiredAt: number;
  expiresAt: number;
}

export class DistributedLockManager {
  private leases: Map<string, LockLease> = new Map();

  /**
   * Attempts to acquire an exclusive lock lease.
   * If an active unexpired lock exists on the key, acquisition fails.
   * If a lock exists but has expired, it is automatically superseded.
   *
   * @param key Distributed lock identifier (e.g. "lock:job:schedule-enforcer")
   * @param ttlSeconds Lease time-to-live in seconds
   * @param ownerId Identifier of the claiming worker or process (defaults to random UUID)
   * @returns true if lock was acquired, false if held by another worker
   */
  async acquireLock(key: string, ttlSeconds = 30, ownerId?: string): Promise<boolean> {
    const now = Date.now();
    const existing = this.leases.get(key);
    const owner = ownerId || `worker_${process.pid}_${Math.random().toString(36).substring(7)}`;

    if (existing && now < existing.expiresAt) {
      if (existing.ownerId === owner) {
        // Idempotent renewal by same owner
        existing.expiresAt = now + ttlSeconds * 1000;
        logger.debug(`[LOCK] Renewed lock "${key}" for owner "${owner}" (TTL: ${ttlSeconds}s)`);
        return true;
      }
      logger.debug(`[LOCK] Collision on "${key}": currently held by "${existing.ownerId}" until ${new Date(existing.expiresAt).toISOString()}`);
      return false;
    }

    // Acquire or take over expired lock
    const lease: LockLease = {
      key,
      ownerId: owner,
      acquiredAt: now,
      expiresAt: now + ttlSeconds * 1000
    };
    this.leases.set(key, lease);
    logger.debug(`[LOCK] Acquired lock "${key}" for owner "${owner}" (TTL: ${ttlSeconds}s)`);
    return true;
  }

  /**
   * Releases an exclusive lock lease.
   * If ownerId is provided, guarantees only the holding owner can release the lease.
   *
   * @param key Distributed lock identifier
   * @param ownerId Identifier of the releasing owner
   * @returns true if released, false if not held or owner mismatched
   */
  async releaseLock(key: string, ownerId?: string): Promise<boolean> {
    const existing = this.leases.get(key);
    if (!existing) {
      return false;
    }

    if (ownerId && existing.ownerId !== ownerId) {
      logger.warn(`[LOCK] Release failed: owner mismatch for "${key}". Expected "${existing.ownerId}", got "${ownerId}"`);
      return false;
    }

    this.leases.delete(key);
    logger.debug(`[LOCK] Released lock "${key}" by owner "${ownerId || existing.ownerId}"`);
    return true;
  }

  /**
   * Checks whether a lock is currently active and unexpired.
   */
  isLocked(key: string): boolean {
    const existing = this.leases.get(key);
    if (!existing) return false;
    if (Date.now() >= existing.expiresAt) {
      this.leases.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Retrieves lease metadata for monitoring and diagnostics.
   */
  getLockDetails(key: string): LockLease | null {
    const existing = this.leases.get(key);
    if (!existing) return null;
    if (Date.now() >= existing.expiresAt) {
      this.leases.delete(key);
      return null;
    }
    return { ...existing };
  }

  /**
   * Executes a critical operation inside an exclusive distributed lock boundary.
   * Ensures guaranteed release upon completion or error.
   */
  async withLock<T>(
    key: string,
    ttlSeconds: number,
    fn: (ownerId: string) => Promise<T>,
    customOwnerId?: string
  ): Promise<{ executed: boolean; result?: T; error?: any }> {
    const ownerId = customOwnerId || `worker_${process.pid}_${Math.random().toString(36).substring(7)}`;
    const acquired = await this.acquireLock(key, ttlSeconds, ownerId);
    if (!acquired) {
      return { executed: false };
    }

    try {
      const result = await fn(ownerId);
      return { executed: true, result };
    } catch (error) {
      return { executed: true, error };
    } finally {
      await this.releaseLock(key, ownerId);
    }
  }

  /**
   * Purges all active lock leases (for test isolation and teardown).
   */
  clearAllLocks(): void {
    this.leases.clear();
  }
}

export const lockManager = new DistributedLockManager();
