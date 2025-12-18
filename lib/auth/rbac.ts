type UserRole = "HR_Admin" | "HR_Manager" | "Employee" | "Finance";

type Action = 'create' | 'read' | 'update' | 'delete' | 'approve';
type Entity = 'employee' | 'contract' | 'letter' | 'attendance' | 'payroll' | 'benefit' | 'user';

// Permission matrix: role -> entity -> actions
const permissions: Record<UserRole, Record<Entity, Action[]>> = {
  HR_Admin: {
    employee: ['create', 'read', 'update', 'delete'],
    contract: ['create', 'read', 'update', 'delete'],
    letter: ['create', 'read', 'update', 'delete'],
    attendance: ['create', 'read', 'update', 'delete', 'approve'],
    payroll: ['create', 'read', 'update', 'delete', 'approve'],
    benefit: ['create', 'read', 'update', 'delete'],
    user: ['create', 'read', 'update', 'delete'],
  },
  HR_Manager: {
    employee: ['read', 'update'],
    contract: ['read', 'update'],
    letter: ['read', 'update'],
    attendance: ['read', 'update', 'approve'],
    payroll: ['read', 'update', 'approve'],
    benefit: ['read', 'update'],
    user: ['read'],
  },
  Employee: {
    employee: ['read'], // Only own record
    contract: ['read'], // Only own contract
    letter: ['read'], // Only own letters
    attendance: ['create', 'read', 'update'], // Own attendance
    payroll: ['read'], // Only own payroll
    benefit: ['read'], // Only own benefits
    user: [],
  },
  Finance: {
    employee: ['read'],
    contract: ['read'],
    letter: ['read'],
    attendance: ['read'],
    payroll: ['read', 'update', 'approve'],
    benefit: ['read'],
    user: [],
  },
};

export function checkPermission(
  role: string,
  action: Action,
  entity: Entity
): boolean {
  const rolePermissions = permissions[role as UserRole];
  if (!rolePermissions) return false;
  
  const entityPermissions = rolePermissions[entity];
  if (!entityPermissions) return false;
  
  return entityPermissions.includes(action);
}

export function canAccessEmployee(role: string, employeeId: string, requestingUserId?: string): boolean {
  // HR_Admin and HR_Manager can access all employees
  if (role === "HR_Admin" || role === "HR_Manager" || role === "Finance") {
    return true;
  }
  
  // Employees can only access their own records
  if (role === "Employee") {
    return employeeId === requestingUserId;
  }
  
  return false;
}


