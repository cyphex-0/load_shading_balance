export interface NotificationTemplatePayload {
  title: string;
  message: string;
}

export class NotificationTemplates {
  static schedulePublished(planningDate: string, feederName?: string): NotificationTemplatePayload {
    return {
      title: 'Load Shedding Schedule Published',
      message: `Load shedding schedule published for ${planningDate} covering your meter line.`
    };
  }

  static scheduleCancelled(planningDate: string): NotificationTemplatePayload {
    return {
      title: 'Load Shedding Cancelled',
      message: `Load shedding schedule for ${planningDate} has been cancelled.`
    };
  }

  static outageAcknowledged(ticketNumber: string): NotificationTemplatePayload {
    return {
      title: 'Outage Report Received',
      message: `We have received your outage report (${ticketNumber}). Our control room has been alerted and a technician is being assigned.`
    };
  }

  static technicianDispatchedCustomer(feederName: string, ticketNumber: string, technicianName?: string): NotificationTemplatePayload {
    return {
      title: 'Technician Dispatched',
      message: `Technician ${technicianName || 'crew'} has been dispatched to repair ${feederName} (${ticketNumber}).`
    };
  }

  static technicianDispatchedTech(feederName: string, ticketNumber: string): NotificationTemplatePayload {
    return {
      title: 'New Outage Fault Assigned',
      message: `You have been dispatched to ${feederName} (${ticketNumber}). Tap to accept and navigate.`
    };
  }

  static powerRestored(ticketNumber: string): NotificationTemplatePayload {
    return {
      title: 'Power Restored',
      message: `Your outage report (${ticketNumber}) has been resolved. Power has been restored to your feeder line.`
    };
  }

  static plannedConflictExplanation(endTime: string): NotificationTemplatePayload {
    return {
      title: 'Scheduled Load Shedding Notice',
      message: `Your area is currently experiencing scheduled load shedding until ${endTime}. No technician dispatch is required.`
    };
  }

  static staffUnassignedAlert(feederName: string, ticketNumber: string): NotificationTemplatePayload {
    return {
      title: 'Action Required: No Technician Available',
      message: `Urgent: Outage ticket ${ticketNumber} on ${feederName} has no available technicians for auto-dispatch. Manual assignment required.`
    };
  }
}
