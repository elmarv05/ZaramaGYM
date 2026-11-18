// ============================================================================
// SERVICIOS IPC: AUDITORÍA INMUTABLE
// Ubicación: src/services/ipc/auditIpc.ts
// ============================================================================

import { AuditFilter, AuditLogItem } from '../../types/auth';
import { safeInvoke } from './client';

export const auditIpc = {
  /**
   * Consulta registros de auditoría filtrados y ordenados descendentemente
   */
  async getAuditLogs(filter: AuditFilter = {}): Promise<AuditLogItem[]> {
    return safeInvoke<AuditLogItem[]>('get_audit_logs', { filter });
  },
};
