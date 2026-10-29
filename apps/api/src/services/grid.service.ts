import { FeederStatus, ScheduleStatus, OutageStatus } from '@load-shedding/shared';
import { store, FeederRecord, OutageTicketRecord } from '../db/store';
import { logger } from '../utils/logger';

export interface EffectiveFeederStatusResult {
  status: FeederStatus;
  isOffline: boolean;
  outageType: 'PLANNED' | 'UNPLANNED' | null;
  activeTicket?: OutageTicketRecord | null;
  activeSlot?: {
    scheduleId: string;
    slotId: string;
    startTime: string;
    endTime: string;
    targetDeficitMW: number;
  } | null;
}

export interface FeederHealthSummary {
  total: number;
  online: number;
  plannedOutage: number;
  unexpectedFault: number;
  criticalExempt: number;
}

export interface ZoneHealthSummary {
  zoneId: string;
  zoneName: string;
  zoneCode: string;
  totalFeeders: number;
  onlineCount: number;
  outageCount: number;
  totalCapacityMW: number;
}

export class GridService {
  /**
   * Deterministically calculates the effective real-time operational status of a feeder.
   *
   * PRECEDENCE HIERARCHY:
   * 1. Physical Hardware Fault: Any active, unresolved OutageTicket (REPORTED, ASSIGNED, EN_ROUTE, REPAIRING)
   *    forces status to UNEXPECTED_FAULT. This takes absolute precedence over scheduled load shedding,
   *    because physical line/transformer damage prevents power transmission even if a planned slot expires.
   * 2. Scheduled Load Shedding: If no hardware fault exists, but current timestamp falls within an active
   *    PUBLISHED schedule slot (startTime <= now <= endTime), status is PLANNED_OUTAGE.
   * 3. Normal Flow: Otherwise, power flows normally and status is ONLINE.
   */
  public getEffectiveFeederStatus(
    feederId: string,
    timestamp: Date = new Date()
  ): EffectiveFeederStatusResult {
    const feeder = store.feeders.get(feederId);
    if (!feeder || feeder.deletedAt) {
      return {
        status: FeederStatus.ONLINE,
        isOffline: false,
        outageType: null,
        activeTicket: null,
        activeSlot: null
      };
    }

    // Step 1: Check for active unresolved unexpected outage tickets
    const activeTicket = Array.from(store.outageTickets.values()).find(
      (t) =>
        t.feederId === feederId &&
        t.status !== OutageStatus.RESOLVED &&
        t.status !== OutageStatus.CANCELLED
    );

    if (activeTicket) {
      return {
        status: FeederStatus.UNEXPECTED_FAULT,
        isOffline: true,
        outageType: 'UNPLANNED',
        activeTicket,
        activeSlot: null
      };
    }

    // Step 2: Check for active published schedule slots covering the given timestamp
    const nowMs = timestamp.getTime();

    for (const schedule of store.schedules.values()) {
      if (schedule.status === ScheduleStatus.PUBLISHED) {
        for (const slot of store.scheduleSlots.values()) {
          if (slot.scheduleId === schedule.id) {
            const startMs = new Date(slot.startTime).getTime();
            const endMs = new Date(slot.endTime).getTime();

            if (nowMs >= startMs && nowMs <= endMs) {
              const isAssigned = Array.from(store.scheduleFeederAssignments.values()).some(
                (a) => a.slotId === slot.id && a.feederId === feederId
              );

              if (isAssigned) {
                return {
                  status: FeederStatus.PLANNED_OUTAGE,
                  isOffline: true,
                  outageType: 'PLANNED',
                  activeTicket: null,
                  activeSlot: {
                    scheduleId: schedule.id,
                    slotId: slot.id,
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                    targetDeficitMW: slot.targetDeficitMW
                  }
                };
              }
            }
          }
        }
      }
    }

    // Step 3: Default normal operational state
    return {
      status: FeederStatus.ONLINE,
      isOffline: false,
      outageType: null,
      activeTicket: null,
      activeSlot: null
    };
  }

  /**
   * Returns a breakdown of active feeders grouped by their dynamic effective operational health.
   */
  public getFeederHealthSummary(zoneId?: string, timestamp: Date = new Date()): FeederHealthSummary {
    let feeders = Array.from(store.feeders.values()).filter((f) => !f.deletedAt);

    if (zoneId) {
      feeders = feeders.filter((f) => {
        const sub = store.substations.get(f.substationId);
        return sub && sub.zoneId === zoneId && !sub.deletedAt;
      });
    }

    let online = 0;
    let plannedOutage = 0;
    let unexpectedFault = 0;
    let criticalExempt = 0;

    for (const f of feeders) {
      if (f.isCritical) {
        criticalExempt++;
      }

      const effective = this.getEffectiveFeederStatus(f.id, timestamp);
      if (effective.status === FeederStatus.UNEXPECTED_FAULT) {
        unexpectedFault++;
      } else if (effective.status === FeederStatus.PLANNED_OUTAGE) {
        plannedOutage++;
      } else {
        online++;
      }
    }

    return {
      total: feeders.length,
      online,
      plannedOutage,
      unexpectedFault,
      criticalExempt
    };
  }

  /**
   * Returns operational health metrics per geographic zone.
   */
  public getZoneHealthSummary(timestamp: Date = new Date()): ZoneHealthSummary[] {
    const activeZones = Array.from(store.zones.values()).filter((z) => !z.deletedAt);

    return activeZones.map((z) => {
      const zoneSubstations = Array.from(store.substations.values()).filter(
        (s) => s.zoneId === z.id && !s.deletedAt
      );
      const subIds = new Set(zoneSubstations.map((s) => s.id));

      const zoneFeeders = Array.from(store.feeders.values()).filter(
        (f) => subIds.has(f.substationId) && !f.deletedAt
      );

      let onlineCount = 0;
      let outageCount = 0;
      let totalCapacityMW = 0;

      for (const f of zoneFeeders) {
        totalCapacityMW += f.capacityMW || 0;
        const effective = this.getEffectiveFeederStatus(f.id, timestamp);
        if (effective.isOffline) {
          outageCount++;
        } else {
          onlineCount++;
        }
      }

      return {
        zoneId: z.id,
        zoneName: z.name,
        zoneCode: z.code,
        totalFeeders: zoneFeeders.length,
        onlineCount,
        outageCount,
        totalCapacityMW: Math.round(totalCapacityMW * 10) / 10
      };
    });
  }

  /**
   * Counts active meters connected to a given feeder.
   */
  public getConnectedMetersCount(feederId: string): number {
    return Array.from(store.meters.values()).filter(
      (m) => m.feederId === feederId && !m.deletedAt
    ).length;
  }
}

export const gridService = new GridService();
