import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

export interface TransactionOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 50;

/**
 * Checks if an error is a transient conflict (serialization failure or deadlock)
 * that is safe to retry in an interactive transaction.
 */
export const isTransientTransactionError = (error: any): boolean => {
  if (!error) return false;

  // Prisma Known Request Error for transaction conflict/deadlock
  if (error.code === 'P2034') {
    return true;
  }

  // PostgreSQL error 40001: serialization_failure
  // PostgreSQL error 40P01: deadlock_detected
  const msg = String(error.message || '').toLowerCase();
  const code = String(error.meta?.code || error.code || '');

  if (code === '40001' || code === '40P01') {
    return true;
  }

  if (
    msg.includes('could not serialize access') ||
    msg.includes('serialization failure') ||
    msg.includes('deadlock detected') ||
    msg.includes('write conflict')
  ) {
    return true;
  }

  return false;
};

/**
 * Executes a callback within a Prisma interactive transaction with exponential backoff
 * and randomized jitter for transient serialization and deadlock errors.
 */
export async function withTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
  client: PrismaClient = prisma
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoff = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await client.$transaction(
        async (tx) => {
          return await action(tx);
        },
        {
          isolationLevel: options.isolationLevel,
          timeout: options.timeoutMs ?? 10000
        }
      );
    } catch (error: any) {
      attempt++;

      if (attempt <= maxRetries && isTransientTransactionError(error)) {
        // Exponential backoff with jitter: 2^attempt * initialBackoff + random jitter
        const jitter = Math.floor(Math.random() * 25);
        const backoff = Math.pow(2, attempt) * initialBackoff + jitter;

        logger.warn(
          `[TRANSACTION] Transient conflict detected (attempt ${attempt}/${maxRetries}). Retrying in ${backoff}ms...`,
          { error: error.message, code: error.code }
        );

        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      // If non-transient or retries exhausted, throw error immediately
      throw error;
    }
  }

  throw new Error(`Transaction failed after ${maxRetries} attempts.`);
}
