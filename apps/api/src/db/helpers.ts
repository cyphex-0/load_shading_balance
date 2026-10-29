import { UserRole } from '@load-shedding/shared';
import { prisma } from './prisma';
import { store } from './store';

/**
 * Injects soft-delete filter ensuring deletedAt is null.
 */
export function whereNotDeleted<T extends Record<string, any>>(filter?: T): T & { deletedAt: null } {
  return {
    ...(filter || ({} as T)),
    deletedAt: null
  };
}

/**
 * Strips password hash and private credentials from a user record
 * for safe transmission over HTTP JSON envelopes.
 */
export function toSafeUser<T extends Record<string, any>>(user: T): Omit<T, 'passwordHash'> {
  if (!user) return user;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Resolves an active meter by its unique meterNumber.
 * Works transparently with Prisma when configured or with MemoryStore in development/test.
 */
export async function findActiveMeterByNumber(meterNumber: string) {
  if (process.env.DATABASE_URL) {
    try {
      return await prisma.meter.findFirst({
        where: whereNotDeleted({ meterNumber }),
        include: {
          feeder: {
            include: {
              substation: {
                include: {
                  zone: true
                }
              }
            }
          }
        }
      });
    } catch {
      // Fallback to store on database failure/mock
    }
  }

  // Fallback to in-memory store
  for (const m of store.meters.values()) {
    if (m.meterNumber === meterNumber && !m.deletedAt) {
      const feeder = store.feeders.get(m.feederId);
      const substation = feeder ? store.substations.get(feeder.substationId) : null;
      const zone = substation ? store.zones.get(substation.zoneId) : null;

      return {
        ...m,
        feeder: feeder
          ? {
              ...feeder,
              substation: substation
                ? {
                    ...substation,
                    zone
                  }
                : null
            }
          : null
      };
    }
  }

  return null;
}

/**
 * Evaluates the effective operational zone scope for a user based on role and assignment.
 */
export function getUserZoneScope(user: { role: UserRole | string; assignedZoneId?: string | null }): {
  isGlobal: boolean;
  zoneId: string | null;
} {
  switch (user.role) {
    case UserRole.ADMIN:
    case UserRole.POWER_OPERATOR:
      return { isGlobal: true, zoneId: null };
    case UserRole.ZONE_MANAGER:
    case UserRole.TECHNICIAN:
      return { isGlobal: false, zoneId: user.assignedZoneId || null };
    case UserRole.CUSTOMER:
    default:
      return { isGlobal: false, zoneId: user.assignedZoneId || null };
  }
}
