import {
  UserRole,
  UserStatus,
  FeederStatus,
  OutageStatus,
  AssignmentStatus,
  UpgradeRequestStatus,
  FaultType,
  ZoneFeederTableItemDto,
  ZoneGridOverviewDto,
  ZoneManagerTicketDto,
  FeederFailureRateItemDto,
  MttrAnalyticsItemDto,
  ZoneMttrResponseDto,
  DailyDeficitItemDto,
  ZoneDailyDeficitResponseDto,
  InfrastructureRequestDto,
  TechnicianRosterItemDto,
  ZoneDto
} from '@load-shedding/shared';
import { store, InfrastructureRequestRecord } from '../db/store';
import { gridService } from './grid.service';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/response';

export class ManagerService {
  /**
   * Endpoint 44: Real-time sortable SCADA grid table for assigned zone (or all zones if Admin).
   */
  getZoneFeeders(
    zoneId: string,
    query: {
      status?: FeederStatus;
      search?: string;
      substationId?: string;
      page?: number;
      pageSize?: number;
    }
  ): {
    overview: ZoneGridOverviewDto;
    paginated: {
      items: ZoneFeederTableItemDto[];
      total: number;
      page: number;
      pageSize: number;
    };
  } {
    const zone = store.zones.get(zoneId);
    if (!zone || zone.deletedAt) {
      throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');
    }

    // 1. Gather all active substations in this zone
    const zoneSubstationIds = new Set(
      Array.from(store.substations.values())
        .filter((s) => s.zoneId === zoneId && !s.deletedAt)
        .map((s) => s.id)
    );

    // 2. Gather active feeders
    let feeders = Array.from(store.feeders.values()).filter(
      (f) => !f.deletedAt && zoneSubstationIds.has(f.substationId)
    );

    if (query.substationId) {
      feeders = feeders.filter((f) => f.substationId === query.substationId);
    }

    if (query.status) {
      feeders = feeders.filter((f) => f.status === query.status);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      feeders = feeders.filter(
        (f) => f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q)
      );
    }

    const gridTable: ZoneFeederTableItemDto[] = feeders.map((f) => {
      const sub = store.substations.get(f.substationId);
      const connectedMeters = gridService.getConnectedMetersCount(f.id);

      // Connected transformers count
      const connectedTransformersCount = Array.from((store as any).transformers?.values?.() || [])
        .filter((tr: any) => tr.feederId === f.id && !tr.deletedAt).length;

      // Open unexpected/unresolved tickets
      const openTickets = Array.from(store.outageTickets.values()).filter(
        (t) => t.feederId === f.id && t.status !== OutageStatus.RESOLVED && t.status !== OutageStatus.CANCELLED
      );

      return {
        id: f.id,
        name: f.name,
        code: f.code,
        capacityMW: f.capacityMW,
        isCritical: f.isCritical,
        status: f.status,
        substationId: f.substationId,
        substationName: sub?.name || 'Unknown Substation',
        zoneId: zone.id,
        zoneName: zone.name,
        connectedTransformersCount,
        connectedMetersCount: connectedMeters,
        openTicketsCount: openTickets.length,
        updatedAt: f.updatedAt
      };
    });

    // Overview counters
    const totalCapacityMW = gridTable.reduce((acc, f) => acc + f.capacityMW, 0);
    const onlineFeedersCount = gridTable.filter((f) => f.status === FeederStatus.ONLINE).length;
    const faultFeedersCount = gridTable.filter((f) => f.status === FeederStatus.UNEXPECTED_FAULT).length;
    const scheduledFeedersCount = gridTable.filter((f) => f.status === FeederStatus.PLANNED_OUTAGE).length;

    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const paginatedItems = gridTable.slice((page - 1) * pageSize, page * pageSize);

    const zoneDto: ZoneDto = {
      id: zone.id,
      name: zone.name,
      code: zone.code,
      description: zone.description,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt
    };

    const overview: ZoneGridOverviewDto = {
      zone: zoneDto,
      totalFeeders: gridTable.length,
      totalCapacityMW,
      onlineFeedersCount,
      faultFeedersCount,
      scheduledFeedersCount,
      feeders: gridTable
    };

    return {
      overview,
      paginated: {
        items: paginatedItems,
        total: gridTable.length,
        page,
        pageSize
      }
    };
  }

  /**
   * Endpoint 45: Live outage tickets within the manager's assigned zone.
   */
  getZoneTickets(
    zoneId: string,
    query: {
      status?: OutageStatus;
      faultType?: FaultType;
      feederId?: string;
      page?: number;
      pageSize?: number;
    }
  ): { items: ZoneManagerTicketDto[]; total: number; page: number; pageSize: number } {
    const zoneSubstationIds = new Set(
      Array.from(store.substations.values())
        .filter((s) => s.zoneId === zoneId && !s.deletedAt)
        .map((s) => s.id)
    );

    const zoneFeederIds = new Set(
      Array.from(store.feeders.values())
        .filter((f) => !f.deletedAt && zoneSubstationIds.has(f.substationId))
        .map((f) => f.id)
    );

    let tickets = Array.from(store.outageTickets.values()).filter((t) =>
      zoneFeederIds.has(t.feederId)
    );

    if (query.status) {
      tickets = tickets.filter((t) => t.status === query.status);
    }

    if (query.faultType) {
      tickets = tickets.filter((t) => t.faultType === query.faultType);
    }

    if (query.feederId) {
      tickets = tickets.filter((t) => t.feederId === query.feederId);
    }

    tickets.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());

    const enriched: ZoneManagerTicketDto[] = tickets.map((t) => {
      const f = store.feeders.get(t.feederId);
      const sub = f ? store.substations.get(f.substationId) : null;
      const zone = sub ? store.zones.get(sub.zoneId) : null;
      const m = store.meters.get(t.meterId);
      const customer = store.users.get(t.customerId);

      const activeAssignment = Array.from(store.technicianAssignments.values()).find(
        (a) =>
          a.ticketId === t.id &&
          (a.status === AssignmentStatus.PENDING ||
            a.status === AssignmentStatus.ACCEPTED ||
            a.status === AssignmentStatus.IN_PROGRESS)
      );
      const tech = activeAssignment ? store.users.get(activeAssignment.technicianId) : null;

      const verifiedAttachmentsCount = Array.from(store.outageAttachments.values()).filter(
        (att) => att.ticketId === t.id && att.isVerified
      ).length;

      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        meterId: t.meterId,
        meterNumber: m?.meterNumber,
        address: m?.address,
        feederId: t.feederId,
        feederName: f?.name || 'Unknown Feeder',
        feederCode: f?.code,
        substationName: sub?.name,
        zoneId: zone?.id,
        zoneName: zone?.name,
        customerId: t.customerId,
        customerName: customer?.name,
        customerPhone: customer?.phone || null,
        faultType: t.faultType || FaultType.OTHER,
        description: t.description,
        landmark: t.landmark || null,
        status: t.status,
        assignedTechnician: tech
          ? {
              id: tech.id,
              name: tech.name,
              phone: tech.phone || null,
              status: activeAssignment!.status
            }
          : null,
        reportedAt: t.reportedAt,
        assignedAt: t.assignedAt || null,
        resolvedAt: t.resolvedAt || null,
        resolutionNotes: t.resolutionNotes || null,
        verifiedAttachmentsCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };
    });

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      total: enriched.length,
      page,
      pageSize
    };
  }

  /**
   * Endpoint 46: Technician roster and live task availability for the zone.
   */
  getZoneTechnicians(
    zoneId: string,
    query: { isAvailable?: boolean; search?: string }
  ): TechnicianRosterItemDto[] {
    let techs = Array.from(store.users.values()).filter(
      (u) =>
        u.role === UserRole.TECHNICIAN &&
        u.status === UserStatus.ACTIVE &&
        !u.deletedAt &&
        u.assignedZoneId === zoneId
    );

    if (query.search) {
      const q = query.search.toLowerCase();
      techs = techs.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    const zone = store.zones.get(zoneId);

    const roster: TechnicianRosterItemDto[] = techs.map((tech) => {
      const assignments = Array.from(store.technicianAssignments.values()).filter(
        (a) => a.technicianId === tech.id
      );

      const activeAssignments = assignments.filter(
        (a) =>
          a.status === AssignmentStatus.PENDING ||
          a.status === AssignmentStatus.ACCEPTED ||
          a.status === AssignmentStatus.IN_PROGRESS
      );
      const activeAssignmentsCount = activeAssignments.length;
      const isAvailable = activeAssignmentsCount < 3;

      const inProgressAssignment =
        assignments.find((a) => a.status === AssignmentStatus.IN_PROGRESS) ||
        assignments.find((a) => a.status === AssignmentStatus.ACCEPTED);

      let currentTask: TechnicianRosterItemDto['currentTask'] = null;
      if (inProgressAssignment) {
        const tkt = store.outageTickets.get(inProgressAssignment.ticketId);
        const fdr = tkt ? store.feeders.get(tkt.feederId) : null;
        if (tkt) {
          currentTask = {
            ticketId: tkt.id,
            ticketNumber: tkt.ticketNumber,
            status: tkt.status,
            feederName: fdr?.name || 'Unknown Feeder',
            startedAt: inProgressAssignment.startedAt || inProgressAssignment.acceptedAt || null
          };
        }
      }

      const completedAssignments = assignments
        .filter((a) => a.status === AssignmentStatus.COMPLETED && a.completedAt)
        .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());
      const lastCompletedAt =
        completedAssignments.length > 0 ? completedAssignments[0].completedAt! : null;

      return {
        id: tech.id,
        name: tech.name,
        email: tech.email,
        phone: tech.phone || null,
        status: tech.status,
        assignedZoneId: tech.assignedZoneId || null,
        zoneName: zone?.name || null,
        activeAssignmentsCount,
        isAvailable,
        currentTask,
        lastCompletedAt
      };
    });

    if (query.isAvailable !== undefined) {
      return roster.filter((r) => r.isAvailable === query.isAvailable);
    }

    roster.sort((a, b) => a.activeAssignmentsCount - b.activeAssignmentsCount);
    return roster;
  }

  /**
   * Endpoint 47: Feeder failure rate analytics.
   * Answers "Which Feeder line fails the most often?"
   */
  getFeederFailureRate(
    zoneId: string,
    query: { from?: string; to?: string; limit?: number }
  ): FeederFailureRateItemDto[] {
    const toMs = query.to ? new Date(query.to).getTime() : Date.now();
    const fromMs = query.from
      ? new Date(query.from).getTime()
      : toMs - 30 * 24 * 60 * 60 * 1000; // 30-day default window

    const zoneSubstationIds = new Set(
      Array.from(store.substations.values())
        .filter((s) => s.zoneId === zoneId && !s.deletedAt)
        .map((s) => s.id)
    );

    const feeders = Array.from(store.feeders.values()).filter(
      (f) => !f.deletedAt && zoneSubstationIds.has(f.substationId)
    );

    const nowMs = Date.now();

    const results: FeederFailureRateItemDto[] = feeders.map((feeder) => {
      const sub = store.substations.get(feeder.substationId);

      const tickets = Array.from(store.outageTickets.values()).filter((t) => {
        if (t.feederId !== feeder.id) return false;
        if (t.isPlanned) return false;
        if (t.status === OutageStatus.CANCELLED) return false;

        const reportedMs = new Date(t.reportedAt).getTime();
        return reportedMs >= fromMs && reportedMs <= toMs;
      });

      const faultCount = tickets.length;
      const resolvedTickets = tickets.filter((t) => t.status === OutageStatus.RESOLVED);
      const resolvedFaultCount = resolvedTickets.length;

      let totalDowntimeMinutes = 0;
      let totalResolutionMinutes = 0;

      for (const t of tickets) {
        const startMs = new Date(t.reportedAt).getTime();
        if (t.status === OutageStatus.RESOLVED && t.resolvedAt) {
          const resMs = new Date(t.resolvedAt).getTime();
          const duration = Math.max(1, (resMs - startMs) / 60000);
          totalDowntimeMinutes += duration;
          totalResolutionMinutes += duration;
        } else {
          const activeDuration = Math.max(1, (nowMs - startMs) / 60000);
          totalDowntimeMinutes += activeDuration;
        }
      }

      const averageResolutionMinutes =
        resolvedFaultCount > 0
          ? Math.round((totalResolutionMinutes / resolvedFaultCount) * 10) / 10
          : 0;

      const sortedTickets = tickets.sort(
        (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
      );
      const lastFaultAt = sortedTickets.length > 0 ? sortedTickets[0].reportedAt : null;

      return {
        feederId: feeder.id,
        feederName: feeder.name,
        feederCode: feeder.code,
        substationName: sub?.name,
        capacityMW: feeder.capacityMW,
        isCritical: feeder.isCritical,
        faultCount,
        resolvedFaultCount,
        totalDowntimeMinutes: Math.round(totalDowntimeMinutes * 10) / 10,
        averageResolutionMinutes,
        lastFaultAt
      };
    });

    results.sort((a, b) => {
      if (b.faultCount !== a.faultCount) {
        return b.faultCount - a.faultCount;
      }
      return a.feederName.localeCompare(b.feederName);
    });

    const limit = query.limit || 20;
    return results.slice(0, limit);
  }

  /**
   * Endpoint 48: Mean Time to Resolution (MTTR) analytics broken down by technician teams.
   */
  getMttrAnalytics(
    zoneId: string,
    query: { technicianId?: string; from?: string; to?: string }
  ): ZoneMttrResponseDto {
    const toMs = query.to ? new Date(query.to).getTime() : Date.now();
    const fromMs = query.from
      ? new Date(query.from).getTime()
      : toMs - 30 * 24 * 60 * 60 * 1000;

    const zone = store.zones.get(zoneId);
    const zoneName = zone?.name || 'Assigned Zone';

    let techs = Array.from(store.users.values()).filter(
      (u) => u.role === UserRole.TECHNICIAN && u.assignedZoneId === zoneId && !u.deletedAt
    );

    if (query.technicianId) {
      techs = techs.filter((u) => u.id === query.technicianId);
    }

    let overallCompletedRepairs = 0;
    let overallResolutionMinutes = 0;

    const technicianMetrics: MttrAnalyticsItemDto[] = techs.map((tech) => {
      const assignments = Array.from(store.technicianAssignments.values()).filter(
        (a) => a.technicianId === tech.id && a.status === AssignmentStatus.COMPLETED && a.completedAt
      );

      const matchingAssignments = assignments.filter((a) => {
        const completedMs = new Date(a.completedAt!).getTime();
        return completedMs >= fromMs && completedMs <= toMs;
      });

      let totalMinutes = 0;
      let fastestMinutes: number | null = null;
      let longestMinutes: number | null = null;

      for (const a of matchingAssignments) {
        const endMs = new Date(a.completedAt!).getTime();
        const startMs = a.startedAt
          ? new Date(a.startedAt).getTime()
          : a.acceptedAt
          ? new Date(a.acceptedAt).getTime()
          : new Date(a.assignedAt).getTime();

        const duration = Math.max(1, Math.round((endMs - startMs) / 60000));
        totalMinutes += duration;

        if (fastestMinutes === null || duration < fastestMinutes) {
          fastestMinutes = duration;
        }
        if (longestMinutes === null || duration > longestMinutes) {
          longestMinutes = duration;
        }
      }

      const count = matchingAssignments.length;
      const mttrMinutes = count > 0 ? Math.round((totalMinutes / count) * 10) / 10 : 0;

      overallCompletedRepairs += count;
      overallResolutionMinutes += totalMinutes;

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        email: tech.email,
        phone: tech.phone || null,
        assignedZoneId: tech.assignedZoneId || null,
        ticketCount: count,
        resolvedTicketsCount: count,
        totalResolutionMinutes: totalMinutes,
        mttrMinutes,
        avgResolutionMinutes: mttrMinutes,
        fastestRepairMinutes: fastestMinutes,
        longestRepairMinutes: longestMinutes
      };
    });

    technicianMetrics.sort((a, b) => b.resolvedTicketsCount - a.resolvedTicketsCount);

    const overallZoneMttrMinutes =
      overallCompletedRepairs > 0
        ? Math.round((overallResolutionMinutes / overallCompletedRepairs) * 10) / 10
        : 0;

    return {
      zoneId,
      zoneName,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      totalCompletedRepairs: overallCompletedRepairs,
      overallZoneMttrMinutes,
      technicians: technicianMetrics
    };
  }

  /**
   * Endpoint 49: Aggregated daily power deficit shed in zone over the last 30 days.
   */
  getDailyDeficitAnalytics(
    zoneId: string,
    query: { from?: string; to?: string; interval?: 'daily' | 'weekly' }
  ): ZoneDailyDeficitResponseDto {
    const zone = store.zones.get(zoneId);
    if (!zone) {
      throw new NotFoundError('Zone not found', 'ZONE_NOT_FOUND');
    }

    const zoneSubstationIds = new Set(
      Array.from(store.substations.values())
        .filter((s) => s.zoneId === zoneId && !s.deletedAt)
        .map((s) => s.id)
    );

    const zoneFeederIds = new Set(
      Array.from(store.feeders.values())
        .filter((f) => !f.deletedAt && zoneSubstationIds.has(f.substationId))
        .map((f) => f.id)
    );

    // Compute dates window (default to 30 days)
    const toDate = query.to ? new Date(query.to) : new Date();
    const fromDate = query.from
      ? new Date(query.from)
      : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

    fromDate.setUTCHours(0, 0, 0, 0);
    toDate.setUTCHours(23, 59, 59, 999);

    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();

    // Map by calendar date: YYYY-MM-DD -> { totalSlots, affectedFeeders, deficitMW, loadShedMWh }
    const dailyMap = new Map<
      string,
      { totalSlots: number; affectedFeeders: Set<string>; deficitMW: number; loadShedMWh: number }
    >();

    // Seed continuous dates in interval
    const curr = new Date(fromDate);
    while (curr.getTime() <= toMs) {
      const dateKey = curr.toISOString().split('T')[0];
      dailyMap.set(dateKey, {
        totalSlots: 0,
        affectedFeeders: new Set<string>(),
        deficitMW: 0,
        loadShedMWh: 0
      });
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // Inspect feeder assignments and their associated slots
    for (const assignment of store.scheduleFeederAssignments.values()) {
      if (!zoneFeederIds.has(assignment.feederId)) continue;

      const slot = store.scheduleSlots.get(assignment.slotId);
      if (!slot) continue;

      const schedule = store.schedules.get(slot.scheduleId);
      const slotDateKey =
        (schedule?.planningDate as string) ||
        new Date(slot.startTime).toISOString().split('T')[0];

      const slotStartMs = new Date(slot.startTime).getTime();
      if (slotStartMs < fromMs || slotStartMs > toMs) continue;

      const entry = dailyMap.get(slotDateKey) || {
        totalSlots: 0,
        affectedFeeders: new Set<string>(),
        deficitMW: 0,
        loadShedMWh: 0
      };

      const feeder = store.feeders.get(assignment.feederId);
      const loadMW = assignment.loadMW || assignment.feederLoadMW || feeder?.capacityMW || 10;
      const durationHours =
        Math.max(0.5, (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 3600000);

      entry.totalSlots += 1;
      entry.affectedFeeders.add(assignment.feederId);
      entry.deficitMW += loadMW;
      entry.loadShedMWh += loadMW * durationHours;

      dailyMap.set(slotDateKey, entry);
    }

    let totalDeficitShedMW = 0;
    let totalLoadShedMWh = 0;
    let peakDeficitDate: string | null = null;
    let peakDeficitMW = 0;

    const dailyBreakdown: DailyDeficitItemDto[] = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => {
        const roundedDeficit = Math.round(data.deficitMW * 10) / 10;
        const roundedMWh = Math.round(data.loadShedMWh * 10) / 10;

        totalDeficitShedMW += roundedDeficit;
        totalLoadShedMWh += roundedMWh;

        if (roundedDeficit > peakDeficitMW) {
          peakDeficitMW = roundedDeficit;
          peakDeficitDate = date;
        }

        return {
          date,
          totalSlots: data.totalSlots,
          affectedFeedersCount: data.affectedFeeders.size,
          deficitMW: roundedDeficit,
          loadShedMWh: roundedMWh
        };
      });

    const activeDaysCount = dailyBreakdown.length || 1;
    const averageDailyDeficitMW = Math.round((totalDeficitShedMW / activeDaysCount) * 10) / 10;

    return {
      zoneId,
      zoneName: zone.name,
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0],
      totalDeficitShedMW: Math.round(totalDeficitShedMW * 10) / 10,
      totalLoadShedMWh: Math.round(totalLoadShedMWh * 10) / 10,
      peakDeficitDate,
      peakDeficitMW: Math.round(peakDeficitMW * 10) / 10,
      averageDailyDeficitMW,
      dailyBreakdown
    };
  }

  /**
   * Endpoint 50: Submit infrastructure upgrade request.
   * Validates feeder existence and enforces horizontal zone boundary.
   */
  createInfrastructureRequest(
    actorId: string,
    data: {
      feederId: string;
      reason: string;
      proposedAction: string;
      supportingMetrics?: Record<string, any>;
    },
    actorZoneId?: string,
    isGlobalAdmin = false
  ): InfrastructureRequestDto {
    const feeder = store.feeders.get(data.feederId);
    if (!feeder || feeder.deletedAt) {
      throw new NotFoundError('Feeder not found', 'FEEDER_NOT_FOUND');
    }

    const sub = store.substations.get(feeder.substationId);
    const feederZoneId = sub?.zoneId;

    if (!isGlobalAdmin && actorZoneId && feederZoneId !== actorZoneId) {
      throw new ForbiddenError(
        'Forbidden: You can only submit upgrade requests for feeders within your assigned zone',
        'ZONE_ACCESS_DENIED'
      );
    }

    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    const request: InfrastructureRequestRecord = {
      id: reqId,
      requesterId: actorId,
      feederId: data.feederId,
      reason: data.reason,
      proposedAction: data.proposedAction,
      supportingMetrics: data.supportingMetrics || {},
      status: UpgradeRequestStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };
    store.infrastructureRequests.set(reqId, request);

    const requester = store.users.get(actorId);

    return {
      ...request,
      requester: requester ? { name: requester.name, email: requester.email } : undefined,
      feeder: {
        id: feeder.id,
        name: feeder.name,
        code: feeder.code,
        substationId: feeder.substationId,
        capacityMW: feeder.capacityMW,
        isCritical: feeder.isCritical,
        status: feeder.status,
        createdAt: feeder.createdAt,
        updatedAt: feeder.updatedAt
      }
    };
  }

  /**
   * Endpoint 51: Lists infrastructure upgrade requests.
   * Scoped to zone for Zone Manager, global for Admin.
   */
  listInfrastructureRequests(
    actorZoneId?: string,
    isGlobalAdmin = false,
    query?: {
      status?: UpgradeRequestStatus;
      feederId?: string;
      zoneId?: string;
      page?: number;
      pageSize?: number;
    }
  ): { items: any[]; total: number; page: number; pageSize: number } {
    let requests = Array.from(store.infrastructureRequests.values());

    if (!isGlobalAdmin && actorZoneId) {
      requests = requests.filter((r) => {
        const f = store.feeders.get(r.feederId);
        const sub = f ? store.substations.get(f.substationId) : null;
        return sub?.zoneId === actorZoneId;
      });
    } else if (query?.zoneId) {
      requests = requests.filter((r) => {
        const f = store.feeders.get(r.feederId);
        const sub = f ? store.substations.get(f.substationId) : null;
        return sub?.zoneId === query.zoneId;
      });
    }

    if (query?.status) {
      requests = requests.filter((r) => r.status === query.status);
    }

    if (query?.feederId) {
      requests = requests.filter((r) => r.feederId === query.feederId);
    }

    requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const enriched = requests.map((r) => {
      const f = store.feeders.get(r.feederId);
      const sub = f ? store.substations.get(f.substationId) : null;
      const zone = sub ? store.zones.get(sub.zoneId) : null;
      const requester = store.users.get(r.requesterId);

      return {
        ...r,
        feederName: f?.name,
        feederCode: f?.code,
        substationName: sub?.name,
        zoneName: zone?.name,
        requesterName: requester?.name,
        requesterEmail: requester?.email
      };
    });

    const page = query?.page || 1;
    const pageSize = query?.pageSize || 20;
    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      total: enriched.length,
      page,
      pageSize
    };
  }
}

export const managerService = new ManagerService();
