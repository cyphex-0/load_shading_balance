import {
  OutageStatus,
  AssignmentStatus,
  FeederStatus,
  UserRole,
  UserStatus,
  NotificationType,
  FaultType,
  OutageDetailDto,
  OutageStatusHistoryDto,
  OutageTransitionResultDto,
  AutoAssignResultDto,
  JwtPayload
} from '@load-shedding/shared';
import {
  store,
  OutageTicketRecord,
  TechnicianAssignmentRecord,
  OutageStatusHistoryRecord
} from '../db/store';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  BadRequestError
} from '../utils/response';
import { socketEmitter } from '../sockets/socket.server';
import { notificationService } from './notification.service';
import { NotificationTemplates } from './notification-templates';
import { logger } from '../utils/logger';

export class OutageService {
  /**
   * Validates if a transition between two outage ticket states is legally permitted.
   */
  validateTransition(currentStatus: OutageStatus, targetStatus: OutageStatus): void {
    if (currentStatus === targetStatus) {
      return;
    }

    // Terminal states cannot transition to anything
    if (currentStatus === OutageStatus.RESOLVED || currentStatus === OutageStatus.CANCELLED) {
      throw new AppError(
        `Cannot transition terminal outage ticket from ${currentStatus} to ${targetStatus}`,
        409,
        'INVALID_STATE_TRANSITION'
      );
    }

    const legalTransitions: Record<OutageStatus, OutageStatus[]> = {
      [OutageStatus.REPORTED]: [OutageStatus.ASSIGNED, OutageStatus.CANCELLED],
      [OutageStatus.ASSIGNED]: [OutageStatus.EN_ROUTE, OutageStatus.CANCELLED],
      [OutageStatus.EN_ROUTE]: [OutageStatus.REPAIRING, OutageStatus.CANCELLED],
      [OutageStatus.REPAIRING]: [OutageStatus.RESOLVED, OutageStatus.CANCELLED],
      [OutageStatus.RESOLVED]: [],
      [OutageStatus.CANCELLED]: []
    };

    const allowed = legalTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        `Illegal outage status transition from ${currentStatus} to ${targetStatus}`,
        409,
        'INVALID_STATE_TRANSITION'
      );
    }
  }

  /**
   * Executes an atomic state machine transition on an OutageTicket.
   */
  async transitionTicket(
    ticketId: string,
    targetStatus: OutageStatus,
    actorId: string,
    notes?: string
  ): Promise<OutageTransitionResultDto> {
    const ticket = store.outageTickets.get(ticketId);
    if (!ticket) {
      throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
    }

    const previousStatus = ticket.status;
    this.validateTransition(previousStatus, targetStatus);

    const nowISO = new Date().toISOString();
    ticket.status = targetStatus;
    ticket.updatedAt = nowISO;

    // Stamp milestone timestamps
    if (targetStatus === OutageStatus.ASSIGNED) {
      ticket.assignedAt = ticket.assignedAt || nowISO;
    } else if (targetStatus === OutageStatus.EN_ROUTE) {
      ticket.enRouteAt = nowISO;
    } else if (targetStatus === OutageStatus.REPAIRING) {
      ticket.repairingAt = nowISO;
    } else if (targetStatus === OutageStatus.RESOLVED) {
      ticket.resolvedAt = nowISO;
      ticket.resolutionNotes = notes || ticket.resolutionNotes || null;
    } else if (targetStatus === OutageStatus.CANCELLED) {
      ticket.cancelledAt = nowISO;
      ticket.cancelledReason = notes || null;
    }

    // Atomically persist status history entry
    const historyId = `hist_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const historyRecord: OutageStatusHistoryRecord = {
      id: historyId,
      ticketId: ticket.id,
      previousStatus,
      newStatus: targetStatus,
      changedById: actorId,
      notes: notes || null,
      createdAt: nowISO
    };
    store.outageStatusHistories.set(historyId, historyRecord);

    // Handle side-effects on assignment records
    const activeAssignments = Array.from(store.technicianAssignments.values()).filter(
      (a) => a.ticketId === ticket.id && a.status !== AssignmentStatus.COMPLETED && a.status !== AssignmentStatus.REASSIGNED
    );

    if (targetStatus === OutageStatus.EN_ROUTE) {
      for (const a of activeAssignments) {
        a.status = AssignmentStatus.ACCEPTED;
        a.acceptedAt = a.acceptedAt || nowISO;
      }
    } else if (targetStatus === OutageStatus.REPAIRING) {
      for (const a of activeAssignments) {
        a.status = AssignmentStatus.IN_PROGRESS;
        a.startedAt = a.startedAt || nowISO;
      }
    } else if (targetStatus === OutageStatus.RESOLVED) {
      for (const a of activeAssignments) {
        a.status = AssignmentStatus.COMPLETED;
        a.completedAt = nowISO;
      }
    } else if (targetStatus === OutageStatus.CANCELLED) {
      for (const a of activeAssignments) {
        a.status = AssignmentStatus.REASSIGNED;
      }
    }

    // If RESOLVED or CANCELLED, evaluate feeder online restoration
    if (targetStatus === OutageStatus.RESOLVED || targetStatus === OutageStatus.CANCELLED) {
      const otherActiveTickets = Array.from(store.outageTickets.values()).some(
        (t) =>
          t.feederId === ticket.feederId &&
          t.id !== ticket.id &&
          t.status !== OutageStatus.RESOLVED &&
          t.status !== OutageStatus.CANCELLED
      );

      const feeder = store.feeders.get(ticket.feederId);
      if (feeder && !otherActiveTickets && feeder.status === FeederStatus.UNEXPECTED_FAULT) {
        feeder.status = FeederStatus.ONLINE;
        feeder.updatedAt = nowISO;
        socketEmitter.emitFeederStatusChanged({
          feederId: feeder.id,
          status: FeederStatus.ONLINE,
          timestamp: nowISO
        });
      }
    }

    // Emit Socket.io event
    socketEmitter.emitTicketStatusChanged({
      ticketId: ticket.id,
      customerId: ticket.customerId,
      status: targetStatus,
      updatedAt: nowISO
    });

    // Customer notifications
    if (targetStatus === OutageStatus.RESOLVED) {
      const template = NotificationTemplates.powerRestored(ticket.ticketNumber);
      await notificationService.createNotification(
        ticket.customerId,
        template.title,
        template.message,
        NotificationType.POWER_RESTORED,
        { ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
        `ticket_resolved:${ticket.id}`
      );
    } else if (targetStatus === OutageStatus.CANCELLED) {
      const reason = notes || 'Cancelled by control room';
      const template = NotificationTemplates.outageCancelled(ticket.ticketNumber, reason);
      await notificationService.createNotification(
        ticket.customerId,
        template.title,
        template.message,
        NotificationType.OUTAGE_REPORTED,
        { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, reason },
        `ticket_cancelled:${ticket.id}`
      );
    }

    return {
      ticket: this.formatTicketDetail(ticket),
      previousStatus,
      newStatus: targetStatus,
      transitionedAt: nowISO
    };
  }

  /**
   * Assigns a technician to an OutageTicket with zone boundary validation
   * and single-active-assignment enforcement.
   */
  async assignTechnician(
    ticketId: string,
    technicianId: string,
    assignedById: string,
    notes?: string
  ): Promise<OutageDetailDto> {
    // 1. Guard against planned conflict events
    if (store.outageReportEvents.has(ticketId)) {
      throw new BadRequestError(
        'Cannot assign technician to planned conflict report event',
        'CANNOT_ASSIGN_CONFLICT_EVENT'
      );
    }

    const ticket = store.outageTickets.get(ticketId);
    if (!ticket) {
      throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
    }

    if (ticket.status === OutageStatus.RESOLVED || ticket.status === OutageStatus.CANCELLED) {
      throw new AppError(
        `Cannot assign technician to a ticket in terminal state ${ticket.status}`,
        409,
        'INVALID_STATE_TRANSITION'
      );
    }

    // 2. Validate technician existence, role, and active status
    const technician = store.users.get(technicianId);
    if (
      !technician ||
      technician.deletedAt ||
      technician.status !== UserStatus.ACTIVE ||
      technician.role !== UserRole.TECHNICIAN
    ) {
      throw new BadRequestError(
        'Selected user is not an active technician',
        'INVALID_TECHNICIAN'
      );
    }

    // 3. Zone boundary validation
    const feeder = store.feeders.get(ticket.feederId);
    const substation = feeder ? store.substations.get(feeder.substationId) : null;
    const ticketZoneId = substation?.zoneId;

    const assigner = store.users.get(assignedById);
    const isGlobalAdmin = assigner?.role === UserRole.ADMIN;

    if (
      technician.assignedZoneId &&
      ticketZoneId &&
      technician.assignedZoneId !== ticketZoneId &&
      !isGlobalAdmin
    ) {
      throw new BadRequestError(
        `Technician ${technician.name} is assigned to zone ${technician.assignedZoneId}, but ticket is in zone ${ticketZoneId}`,
        'ZONE_MISMATCH'
      );
    }

    const nowISO = new Date().toISOString();

    // 4. Single active assignment invariant: supersede existing active assignments
    for (const a of store.technicianAssignments.values()) {
      if (
        a.ticketId === ticket.id &&
        (a.status === AssignmentStatus.PENDING ||
          a.status === AssignmentStatus.ACCEPTED ||
          a.status === AssignmentStatus.IN_PROGRESS)
      ) {
        a.status = AssignmentStatus.REASSIGNED;
      }
    }

    // 5. Create new TechnicianAssignmentRecord
    const assignmentId = `asgn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const assignment: TechnicianAssignmentRecord = {
      id: assignmentId,
      ticketId: ticket.id,
      technicianId,
      assignedById,
      status: AssignmentStatus.PENDING,
      assignedAt: nowISO
    };
    store.technicianAssignments.set(assignmentId, assignment);

    // 6. Transition ticket status if currently REPORTED
    if (ticket.status === OutageStatus.REPORTED) {
      ticket.status = OutageStatus.ASSIGNED;
      ticket.assignedAt = nowISO;
      ticket.updatedAt = nowISO;

      const histId = `hist_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      store.outageStatusHistories.set(histId, {
        id: histId,
        ticketId: ticket.id,
        previousStatus: OutageStatus.REPORTED,
        newStatus: OutageStatus.ASSIGNED,
        changedById: assignedById,
        notes: notes || `Assigned to technician ${technician.name}`,
        createdAt: nowISO
      });
    }

    // 7. Emit real-time events
    const meter = store.meters.get(ticket.meterId);
    socketEmitter.emitTicketAssigned({
      ticketId: ticket.id,
      technicianId,
      feederName: feeder?.name || 'Unknown',
      address: meter?.address || 'Unknown',
      assignedAt: nowISO
    });

    socketEmitter.emitTicketStatusChanged({
      ticketId: ticket.id,
      customerId: ticket.customerId,
      status: ticket.status,
      updatedAt: nowISO
    });

    // 8. Queue SMS to dispatched technician
    const dispatchTemplate = NotificationTemplates.technicianDispatchedTech(
      feeder?.name || 'Assigned Feeder',
      ticket.ticketNumber
    );

    if (technician.phone) {
      await notificationService.createNotification(
        technician.id,
        dispatchTemplate.title,
        dispatchTemplate.message,
        NotificationType.TECHNICIAN_DISPATCHED,
        { ticketId: ticket.id, feederId: ticket.feederId },
        `dispatch:${ticket.id}:${technician.id}`
      );
    }

    return this.formatTicketDetail(ticket);
  }

  /**
   * Deterministic least-busy technician auto-assignment engine.
   * Ranks candidates by:
   * 1. Fewest active assignments
   * 2. Oldest last-assigned timestamp (round-robin fairness)
   * 3. User ID ascending (deterministic tie-breaker)
   */
  async autoAssignTechnician(ticketId: string, actorId: string): Promise<AutoAssignResultDto> {
    const ticket = store.outageTickets.get(ticketId);
    if (!ticket) {
      throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
    }

    const feeder = store.feeders.get(ticket.feederId);
    const substation = feeder ? store.substations.get(feeder.substationId) : null;
    const ticketZoneId = substation?.zoneId;

    if (!ticketZoneId) {
      throw new BadRequestError('Ticket feeder zone not resolved', 'ZONE_NOT_FOUND');
    }

    // Eligible active technicians in the zone
    const candidates = Array.from(store.users.values()).filter(
      (u) =>
        u.role === UserRole.TECHNICIAN &&
        u.status === UserStatus.ACTIVE &&
        !u.deletedAt &&
        u.assignedZoneId === ticketZoneId
    );

    if (candidates.length === 0) {
      throw new NotFoundError(
        `No active technicians available in zone ${ticketZoneId}`,
        'NO_AVAILABLE_TECHNICIANS'
      );
    }

    // Compute metrics for each candidate
    const getActiveCount = (techId: string) => {
      return Array.from(store.technicianAssignments.values()).filter(
        (a) =>
          a.technicianId === techId &&
          (a.status === AssignmentStatus.PENDING ||
            a.status === AssignmentStatus.ACCEPTED ||
            a.status === AssignmentStatus.IN_PROGRESS)
      ).length;
    };

    const getLastAssignedTime = (techId: string) => {
      const assignments = Array.from(store.technicianAssignments.values())
        .filter((a) => a.technicianId === techId)
        .map((a) => new Date(a.assignedAt).getTime())
        .sort((a, b) => b - a);
      return assignments.length > 0 ? assignments[0] : 0;
    };

    candidates.sort((a, b) => {
      // 1. Least active assignments
      const loadA = getActiveCount(a.id);
      const loadB = getActiveCount(b.id);
      if (loadA !== loadB) {
        return loadA - loadB;
      }

      // 2. Oldest assignment (unassigned / least recently assigned first)
      const timeA = getLastAssignedTime(a.id);
      const timeB = getLastAssignedTime(b.id);
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // 3. User ID tie breaker
      return a.id.localeCompare(b.id);
    });

    const chosenTechnician = candidates[0];
    await this.assignTechnician(
      ticket.id,
      chosenTechnician.id,
      actorId,
      'Automated least-busy dispatch'
    );

    return {
      ticketId: ticket.id,
      technicianId: chosenTechnician.id,
      technicianName: chosenTechnician.name,
      assignedAt: new Date().toISOString()
    };
  }

  /**
   * Helper to format an OutageTicket into an enriched OutageDetailDto.
   */
  formatTicketDetail(ticket: OutageTicketRecord): OutageDetailDto {
    const customer = store.users.get(ticket.customerId);
    const meter = store.meters.get(ticket.meterId);
    const feeder = store.feeders.get(ticket.feederId);
    const substation = feeder ? store.substations.get(feeder.substationId) : null;
    const zone = substation ? store.zones.get(substation.zoneId) : null;

    // Active or latest assignment
    const assignments = Array.from(store.technicianAssignments.values()).filter(
      (a) => a.ticketId === ticket.id
    );
    const activeAssignment =
      assignments.find(
        (a) =>
          a.status === AssignmentStatus.PENDING ||
          a.status === AssignmentStatus.ACCEPTED ||
          a.status === AssignmentStatus.IN_PROGRESS
      ) ||
      assignments.sort(
        (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
      )[0];

    const tech = activeAssignment ? store.users.get(activeAssignment.technicianId) : null;

    const history: OutageStatusHistoryDto[] = Array.from(store.outageStatusHistories.values())
      .filter((h) => h.ticketId === ticket.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((h) => {
        const actor = h.changedById ? store.users.get(h.changedById) : null;
        return {
          id: h.id,
          ticketId: h.ticketId,
          previousStatus: h.previousStatus || null,
          newStatus: h.newStatus,
          changedById: h.changedById || null,
          changedByName: actor?.name || undefined,
          notes: h.notes || null,
          createdAt: h.createdAt
        };
      });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerId: ticket.customerId,
      customerName: customer?.name,
      customerPhone: customer?.phone || null,
      meterId: ticket.meterId,
      meterNumber: meter?.meterNumber || 'Unknown',
      meterAddress: meter?.address,
      feederId: ticket.feederId,
      feederName: feeder?.name || 'Unknown',
      feederCode: feeder?.code,
      substationId: substation?.id,
      substationName: substation?.name,
      zoneId: zone?.id,
      zoneName: zone?.name,
      assignedTechnicianId: tech?.id || null,
      assignedTechnicianName: tech?.name || null,
      assignedTechnicianPhone: tech?.phone || null,
      status: ticket.status,
      faultType: ticket.faultType || FaultType.OTHER,
      description: ticket.description,
      landmark: ticket.landmark || null,
      resolutionNotes: ticket.resolutionNotes || null,
      reportedAt: ticket.reportedAt,
      assignedAt: ticket.assignedAt || null,
      enRouteAt: ticket.enRouteAt || null,
      repairingAt: ticket.repairingAt || null,
      resolvedAt: ticket.resolvedAt || null,
      cancelledAt: ticket.cancelledAt || null,
      cancelledReason: ticket.cancelledReason || null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      history
    };
  }

  /**
   * Retrieves enriched outage ticket details with scoped authorization checks.
   */
  getTicketDetail(ticketId: string, user?: JwtPayload): OutageDetailDto {
    const ticket = store.outageTickets.get(ticketId);
    if (!ticket) {
      throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
    }

    if (user) {
      // Role scope verification
      if (user.role === UserRole.CUSTOMER) {
        if (ticket.customerId !== user.sub) {
          throw new NotFoundError('Outage ticket not found', 'TICKET_NOT_FOUND');
        }
      } else if (user.role === UserRole.TECHNICIAN) {
        const isAssigned = Array.from(store.technicianAssignments.values()).some(
          (a) => a.ticketId === ticket.id && a.technicianId === user.sub
        );
        if (!isAssigned) {
          throw new ForbiddenError('You are not assigned to this outage ticket', 'FORBIDDEN');
        }
      } else if (user.role === UserRole.ZONE_MANAGER) {
        const feeder = store.feeders.get(ticket.feederId);
        const sub = feeder ? store.substations.get(feeder.substationId) : null;
        if (user.zoneId && sub && sub.zoneId !== user.zoneId) {
          throw new ForbiddenError('Ticket is outside your managed zone', 'FORBIDDEN');
        }
      }
    }

    return this.formatTicketDetail(ticket);
  }

  /**
   * Retrieves status and assignment history for a ticket.
   */
  getTicketHistory(ticketId: string, user?: JwtPayload): OutageStatusHistoryDto[] {
    const detail = this.getTicketDetail(ticketId, user);
    return detail.history || [];
  }
}

export const outageService = new OutageService();
