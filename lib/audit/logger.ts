import { prisma } from '@/lib/db';

type EntityType = "Employee" | "Contract" | "AdministrativeLetter" | "AttendanceRecord" | "Payroll" | "Benefit" | "User";
type AuditAction = "Create" | "Update" | "Delete" | "Read";

export async function logAction(
  entityType: string,
  entityId: string,
  action: string,
  userId: string | null,
  details?: Record<string, any>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        performedBy: userId || undefined,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break main operations
    console.error('Failed to create audit log:', error);
  }
}

export async function getAuditLogs(filters: {
  entityType?: string;
  entityId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const where: any = {};
  
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.userId) where.performedBy = filters.userId;
  if (filters.startDate || filters.endDate) {
    where.timestamp = {};
    if (filters.startDate) where.timestamp.gte = filters.startDate;
    if (filters.endDate) where.timestamp.lte = filters.endDate;
  }
  
  return prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: filters.limit || 100,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
        },
      },
    },
  });
}


