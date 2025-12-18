import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/db";
// Note: Using string types instead of enums for SQLite compatibility
type EmploymentStatus = "Active" | "Onboarding" | "Terminated" | "Archived";
type ContractType = "Permanent" | "Temporary" | "Internship" | "Consultant";
type LetterType = "Confirmation" | "Termination" | "Promotion" | "Warning" | "Other";
type LeaveType = "Sick" | "Vacation" | "Unpaid" | "None";
type LeaveStatus = "Requested" | "Approved" | "Rejected";
type PayrollStatus = "Pending" | "Calculated" | "Verified" | "Approved" | "Paid";
type BenefitType = "Insurance" | "Housing" | "Transport" | "Other";
type EntityType = "Employee" | "Contract" | "AdministrativeLetter" | "AttendanceRecord" | "Payroll" | "Benefit" | "User";
type AuditAction = "Create" | "Update" | "Delete" | "Read";
type UserRole = "HR_Admin" | "HR_Manager" | "Employee" | "Finance";
import { checkPermission, canAccessEmployee } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit/logger";
import { storeDocument } from "@/lib/storage/files";

// Context for tool execution
export interface ToolContext {
  userId?: string;
  role: string; // UserRole as string
}

// Helper to check permissions and throw if unauthorized
function requirePermission(
  role: string,
  action: 'create' | 'read' | 'update' | 'delete' | 'approve',
  entity: 'employee' | 'contract' | 'letter' | 'attendance' | 'payroll' | 'benefit' | 'user',
  userId?: string
) {
  if (!checkPermission(role, action, entity)) {
    throw new Error(`Unauthorized: ${role} cannot ${action} ${entity}`);
  }
}

// Create tools with user context
export function createHRTools(context: ToolContext): typeof hrTools {
  // We'll need to wrap each tool to inject context
  // For now, we'll use a global context store approach
  return hrTools;
}

// Global context store (set before tool execution)
let currentContext: ToolContext | null = null;

export function setToolContext(context: ToolContext) {
  currentContext = context;
}

export function getToolContext(): ToolContext {
  if (!currentContext) {
    throw new Error('Tool context not set');
  }
  return currentContext;
}

// Employee Tools
export const employeeTools = {
  createEmployee: tool({
    description: "Create a new employee record with personal info, job details, salary, and benefits.",
    inputSchema: z.object({
      firstName: z.string().describe("Employee first name"),
      lastName: z.string().describe("Employee last name"),
      nationalId: z.string().describe("National ID (unique)"),
      dateOfBirth: z.string().describe("Date of birth (ISO format)"),
      gender: z.enum(["Male", "Female", "Other"]).describe("Gender"),
      phoneNumber: z.string().optional().describe("Phone number"),
      email: z.string().email().optional().describe("Email address"),
      address: z.string().optional().describe("Address"),
      jobTitle: z.string().describe("Job title"),
      department: z.string().describe("Department"),
      salary: z.number().describe("Base salary"),
      benefits: z.string().optional().describe("JSON string for benefits (insurance, allowances, etc.)"),
      leaveBalance: z.number().optional().default(0).describe("Initial leave balance in days"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'employee', ctx.userId);
      
      const employee = await prisma.employee.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          nationalId: input.nationalId,
          dateOfBirth: new Date(input.dateOfBirth),
          gender: input.gender,
          phoneNumber: input.phoneNumber,
          email: input.email,
          address: input.address,
          jobTitle: input.jobTitle,
          department: input.department,
          salary: input.salary,
          benefits: input.benefits,
          leaveBalance: input.leaveBalance || 0,
          hireDate: new Date(),
          employmentStatus: "Onboarding" as EmploymentStatus,
        },
      });

      await logAction("Employee", employee.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(employee, null, 2);
    },
  }),

  updateEmployee: tool({
    description: "Update an existing employee record. Only specified fields will be updated.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phoneNumber: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      jobTitle: z.string().optional(),
      department: z.string().optional(),
      salary: z.number().optional(),
      benefits: z.string().optional(),
      leaveBalance: z.number().optional(),
      employmentStatus: z.enum(["Active", "Onboarding", "Terminated", "Archived"]).optional(),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'employee', ctx.userId);
      
      if (!canAccessEmployee(ctx.role, input.employeeId, ctx.userId)) {
        throw new Error("Unauthorized: Cannot access this employee record");
      }

      const updateData: any = {};
      if (input.firstName !== undefined) updateData.firstName = input.firstName;
      if (input.lastName !== undefined) updateData.lastName = input.lastName;
      if (input.phoneNumber !== undefined) updateData.phoneNumber = input.phoneNumber;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.address !== undefined) updateData.address = input.address;
      if (input.jobTitle !== undefined) updateData.jobTitle = input.jobTitle;
      if (input.department !== undefined) updateData.department = input.department;
      if (input.salary !== undefined) updateData.salary = input.salary;
      if (input.benefits !== undefined) updateData.benefits = input.benefits;
      if (input.leaveBalance !== undefined) updateData.leaveBalance = input.leaveBalance;
      if (input.employmentStatus !== undefined) {
        updateData.employmentStatus = input.employmentStatus;
      }

      const employee = await prisma.employee.update({
        where: { id: input.employeeId },
        data: updateData,
      });

      await logAction("Employee", employee.id, "Update", ctx.userId || null, input);
      
      return JSON.stringify(employee, null, 2);
    },
  }),

  getEmployee: tool({
    description: "Retrieve employee record(s) by ID or search by name/department.",
    inputSchema: z.object({
      employeeId: z.string().optional().describe("Employee ID (if searching by ID)"),
      name: z.string().optional().describe("Search by name (partial match)"),
      department: z.string().optional().describe("Filter by department"),
      limit: z.number().optional().default(10).describe("Max results (for search)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'employee', ctx.userId);

      if (input.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { id: input.employeeId },
          include: {
            contracts: true,
            letters: true,
            employeeBenefits: true,
          },
        });

        if (!employee) {
          return "Employee not found";
        }

        if (!canAccessEmployee(ctx.role, employee.id, ctx.userId)) {
          throw new Error("Unauthorized: Cannot access this employee record");
        }

        await logAction("Employee", employee.id, "Read", ctx.userId || null);
        return JSON.stringify(employee, null, 2);
      }

      // Search mode
      const where: any = {};
      if (input.name) {
        where.OR = [
          { firstName: { contains: input.name, mode: 'insensitive' } },
          { lastName: { contains: input.name, mode: 'insensitive' } },
        ];
      }
      if (input.department) {
        where.department = { contains: input.department, mode: 'insensitive' };
      }

      const employees = await prisma.employee.findMany({
        where,
        take: input.limit || 10,
        orderBy: { createdAt: 'desc' },
      });

      // Filter by access permissions
      const accessibleEmployees = employees.filter(emp => 
        canAccessEmployee(ctx.role, emp.id, ctx.userId)
      );

      return JSON.stringify(accessibleEmployees, null, 2);
    },
  }),

  archiveEmployee: tool({
    description: "Archive a terminated employee (set employment_status to Archived).",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'employee', ctx.userId);

      const employee = await prisma.employee.update({
        where: { id: input.employeeId },
        data: { employmentStatus: "Archived" },
      });

      await logAction("Employee", employee.id, "Update", ctx.userId || null, {
        action: 'archived',
      });

      return JSON.stringify(employee, null, 2);
    },
  }),

  reactivateEmployee: tool({
    description: "Reactivate an archived employee (set employment_status to Active).",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'employee', ctx.userId);

      const employee = await prisma.employee.update({
        where: { id: input.employeeId },
        data: { employmentStatus: "Active" },
      });

      await logAction("Employee", employee.id, "Update", ctx.userId || null, {
        action: 'reactivated',
      });

      return JSON.stringify(employee, null, 2);
    },
  }),
};

// Contract Tools
export const contractTools = {
  createContract: tool({
    description: "Create a new contract for an employee.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      contractType: z.enum(["Permanent", "Temporary", "Internship", "Consultant"]).describe("Contract type"),
      startDate: z.string().describe("Start date (ISO format)"),
      endDate: z.string().optional().describe("End date (ISO format, optional for permanent contracts)"),
      documentUrl: z.string().optional().describe("URL/path to contract document"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'contract', ctx.userId);

      const contract = await prisma.contract.create({
        data: {
          employeeId: input.employeeId,
          contractType: input.contractType as ContractType,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
          documentUrl: input.documentUrl,
        },
      });

      await logAction("Contract", contract.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(contract, null, 2);
    },
  }),

  updateContract: tool({
    description: "Update contract details.",
    inputSchema: z.object({
      contractId: z.string().describe("Contract ID"),
      contractType: z.enum(["Permanent", "Temporary", "Internship", "Consultant"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      signedByEmployee: z.boolean().optional(),
      signedByHr: z.boolean().optional(),
      documentUrl: z.string().optional(),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'contract', ctx.userId);

      const updateData: any = {};
      if (input.contractType !== undefined) updateData.contractType = input.contractType as ContractType;
      if (input.startDate !== undefined) updateData.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;
      if (input.signedByEmployee !== undefined) updateData.signedByEmployee = input.signedByEmployee;
      if (input.signedByHr !== undefined) updateData.signedByHr = input.signedByHr;
      if (input.documentUrl !== undefined) updateData.documentUrl = input.documentUrl;

      const contract = await prisma.contract.update({
        where: { id: input.contractId },
        data: updateData,
      });

      await logAction("Contract", contract.id, "Update", ctx.userId || null, input);
      
      return JSON.stringify(contract, null, 2);
    },
  }),

  getContract: tool({
    description: "Retrieve contract(s) for an employee.",
    inputSchema: z.object({
      employeeId: z.string().optional().describe("Employee ID"),
      contractId: z.string().optional().describe("Contract ID (if searching by contract)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'contract', ctx.userId);

      if (input.contractId) {
        const contract = await prisma.contract.findUnique({
          where: { id: input.contractId },
          include: { employee: true },
        });
        return contract ? JSON.stringify(contract, null, 2) : "Contract not found";
      }

      if (input.employeeId) {
        const contracts = await prisma.contract.findMany({
          where: { employeeId: input.employeeId },
          orderBy: { startDate: 'desc' },
        });
        return JSON.stringify(contracts, null, 2);
      }

      return "Please provide either employeeId or contractId";
    },
  }),

  terminateContract: tool({
    description: "Terminate a contract by setting end_date.",
    inputSchema: z.object({
      contractId: z.string().describe("Contract ID"),
      terminationDate: z.string().describe("Termination date (ISO format)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'contract', ctx.userId);

      const contract = await prisma.contract.update({
        where: { id: input.contractId },
        data: { endDate: new Date(input.terminationDate) },
      });

      await logAction("Contract", contract.id, "Update", ctx.userId || null, {
        action: 'terminated',
        terminationDate: input.terminationDate,
      });

      return JSON.stringify(contract, null, 2);
    },
  }),
};

// Letter Tools
export const letterTools = {
  generateLetter: tool({
    description: "Generate an administrative letter (confirmation, termination, promotion, etc.) for an employee.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      letterType: z.enum(["Confirmation", "Termination", "Promotion", "Warning", "Other"]).describe("Letter type"),
      content: z.string().describe("Letter content (can include template variables)"),
      documentUrl: z.string().optional().describe("URL/path to stored document"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'letter', ctx.userId);

      const letter = await prisma.administrativeLetter.create({
        data: {
          employeeId: input.employeeId,
          letterType: input.letterType as LetterType,
          content: input.content,
          documentUrl: input.documentUrl,
          issuedDate: new Date(),
        },
        include: { employee: true },
      });

      await logAction("AdministrativeLetter", letter.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(letter, null, 2);
    },
  }),

  getLetters: tool({
    description: "Retrieve all administrative letters for an employee.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'letter', ctx.userId);

      const letters = await prisma.administrativeLetter.findMany({
        where: { employeeId: input.employeeId },
        orderBy: { issuedDate: 'desc' },
      });

      return JSON.stringify(letters, null, 2);
    },
  }),
};

// Attendance Tools
export const attendanceTools = {
  recordAttendance: tool({
    description: "Record attendance for an employee (check-in, check-out, hours worked).",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      date: z.string().describe("Date (ISO format)"),
      checkInTime: z.string().optional().describe("Check-in time (ISO format)"),
      checkOutTime: z.string().optional().describe("Check-out time (ISO format)"),
      hoursWorked: z.number().optional().describe("Hours worked (if not calculated from check-in/out)"),
      overtimeHours: z.number().optional().default(0).describe("Overtime hours"),
      leaveType: z.enum(["Sick", "Vacation", "Unpaid", "None"]).optional().default("None"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'attendance', ctx.userId);

      const attendance = await prisma.attendanceRecord.create({
        data: {
          employeeId: input.employeeId,
          date: new Date(input.date),
          checkInTime: input.checkInTime ? new Date(input.checkInTime) : null,
          checkOutTime: input.checkOutTime ? new Date(input.checkOutTime) : null,
          hoursWorked: input.hoursWorked || null,
          overtimeHours: input.overtimeHours || 0,
          leaveType: (input.leaveType as LeaveType) || "None",
        },
      });

      await logAction("AttendanceRecord", attendance.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(attendance, null, 2);
    },
  }),

  updateAttendance: tool({
    description: "Update an attendance record.",
    inputSchema: z.object({
      attendanceId: z.string().describe("Attendance record ID"),
      checkInTime: z.string().optional(),
      checkOutTime: z.string().optional(),
      hoursWorked: z.number().optional(),
      overtimeHours: z.number().optional(),
      leaveType: z.enum(["Sick", "Vacation", "Unpaid", "None"]).optional(),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'attendance', ctx.userId);

      const updateData: any = {};
      if (input.checkInTime !== undefined) updateData.checkInTime = new Date(input.checkInTime);
      if (input.checkOutTime !== undefined) updateData.checkOutTime = new Date(input.checkOutTime);
      if (input.hoursWorked !== undefined) updateData.hoursWorked = input.hoursWorked;
      if (input.overtimeHours !== undefined) updateData.overtimeHours = input.overtimeHours;
      if (input.leaveType !== undefined) updateData.leaveType = input.leaveType as LeaveType;

      const attendance = await prisma.attendanceRecord.update({
        where: { id: input.attendanceId },
        data: updateData,
      });

      await logAction("AttendanceRecord", attendance.id, "Update", ctx.userId || null, input);
      
      return JSON.stringify(attendance, null, 2);
    },
  }),

  getAttendance: tool({
    description: "Retrieve attendance records for an employee within a date range.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      startDate: z.string().describe("Start date (ISO format)"),
      endDate: z.string().describe("End date (ISO format)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'attendance', ctx.userId);

      const records = await prisma.attendanceRecord.findMany({
        where: {
          employeeId: input.employeeId,
          date: {
            gte: new Date(input.startDate),
            lte: new Date(input.endDate),
          },
        },
        orderBy: { date: 'desc' },
      });

      return JSON.stringify(records, null, 2);
    },
  }),

  approveLeave: tool({
    description: "Approve or reject a leave request.",
    inputSchema: z.object({
      attendanceId: z.string().describe("Attendance record ID"),
      status: z.enum(["Approved", "Rejected"]).describe("Leave status"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'approve', 'attendance', ctx.userId);

      const attendance = await prisma.attendanceRecord.update({
        where: { id: input.attendanceId },
        data: { leaveStatus: input.status as LeaveStatus },
      });

      await logAction("AttendanceRecord", attendance.id, "Update", ctx.userId || null, {
        action: 'leave_approved',
        status: input.status,
      });

      return JSON.stringify(attendance, null, 2);
    },
  }),

  requestLeave: tool({
    description: "Employee requests leave (creates attendance record with leave type).",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      date: z.string().describe("Leave date (ISO format)"),
      leaveType: z.enum(["Sick", "Vacation", "Unpaid"]).describe("Type of leave"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'attendance', ctx.userId);

      const attendance = await prisma.attendanceRecord.create({
        data: {
          employeeId: input.employeeId,
          date: new Date(input.date),
          leaveType: input.leaveType as LeaveType,
          leaveStatus: "Requested",
        },
      });

      await logAction("AttendanceRecord", attendance.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(attendance, null, 2);
    },
  }),
};

// Payroll Tools
export const payrollTools = {
  calculatePayroll: tool({
    description: "Calculate payroll for an employee for a given period (base salary + overtime - deductions).",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      periodStart: z.string().describe("Period start date (ISO format)"),
      periodEnd: z.string().describe("Period end date (ISO format)"),
      deductions: z.string().optional().describe("JSON string for deductions (tax, insurance, penalties)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'payroll', ctx.userId);

      // Get employee
      const employee = await prisma.employee.findUnique({
        where: { id: input.employeeId },
      });

      if (!employee) {
        throw new Error("Employee not found");
      }

      // Calculate overtime from attendance records
      const attendanceRecords = await prisma.attendanceRecord.findMany({
        where: {
          employeeId: input.employeeId,
          date: {
            gte: new Date(input.periodStart),
            lte: new Date(input.periodEnd),
          },
        },
      });

      const totalOvertimeHours = attendanceRecords.reduce((sum, record) => sum + (record.overtimeHours || 0), 0);
      const overtimePay = totalOvertimeHours * (employee.salary / 160) * 1.5; // Assuming 160 hours/month, 1.5x rate

      // Parse deductions
      let deductionsObj: any = {};
      if (input.deductions) {
        try {
          deductionsObj = JSON.parse(input.deductions);
        } catch {
          // Invalid JSON, use empty object
        }
      }

      const totalDeductions = Object.values(deductionsObj).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
      const netSalary = employee.salary + overtimePay - totalDeductions;

      const payroll = await prisma.payroll.create({
        data: {
          employeeId: input.employeeId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          baseSalary: employee.salary,
          overtimePay,
          deductions: input.deductions || null,
          netSalary,
          status: "Calculated",
        },
      });

      await logAction("Payroll", payroll.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(payroll, null, 2);
    },
  }),

  getPayroll: tool({
    description: "Retrieve payroll records for an employee.",
    inputSchema: z.object({
      employeeId: z.string().optional().describe("Employee ID"),
      payrollId: z.string().optional().describe("Payroll ID (if searching by ID)"),
      limit: z.number().optional().default(10).describe("Max results"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'payroll', ctx.userId);

      if (input.payrollId) {
        const payroll = await prisma.payroll.findUnique({
          where: { id: input.payrollId },
          include: { employee: true },
        });
        return payroll ? JSON.stringify(payroll, null, 2) : "Payroll not found";
      }

      if (input.employeeId) {
        const payrolls = await prisma.payroll.findMany({
          where: { employeeId: input.employeeId },
          orderBy: { periodStart: 'desc' },
          take: input.limit || 10,
        });
        return JSON.stringify(payrolls, null, 2);
      }

      return "Please provide either employeeId or payrollId";
    },
  }),

  approvePayroll: tool({
    description: "Approve payroll (HR Manager or Finance only).",
    inputSchema: z.object({
      payrollId: z.string().describe("Payroll ID"),
      status: z.enum(["Verified", "Approved"]).describe("New status"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'approve', 'payroll', ctx.userId);

      const payroll = await prisma.payroll.update({
        where: { id: input.payrollId },
        data: { 
          status: input.status === "Approved" ? "Approved" : "Verified",
        },
      });

      await logAction("Payroll", payroll.id, "Update", ctx.userId || null, {
        action: 'approved',
        status: input.status,
      });

      return JSON.stringify(payroll, null, 2);
    },
  }),

  paySalary: tool({
    description: "Mark payroll as paid with payment date.",
    inputSchema: z.object({
      payrollId: z.string().describe("Payroll ID"),
      paymentDate: z.string().describe("Payment date (ISO format)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'payroll', ctx.userId);

      const payroll = await prisma.payroll.update({
        where: { id: input.payrollId },
        data: {
          status: "Paid",
          paymentDate: new Date(input.paymentDate),
        },
      });

      await logAction("Payroll", payroll.id, "Update", ctx.userId || null, {
        action: 'paid',
        paymentDate: input.paymentDate,
      });

      return JSON.stringify(payroll, null, 2);
    },
  }),
};

// Benefit Tools
export const benefitTools = {
  addBenefit: tool({
    description: "Add a benefit to an employee.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
      benefitType: z.enum(["Insurance", "Housing", "Transport", "Other"]).describe("Benefit type"),
      amount: z.number().describe("Benefit amount"),
      startDate: z.string().describe("Start date (ISO format)"),
      endDate: z.string().optional().describe("End date (ISO format, optional)"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'create', 'benefit', ctx.userId);

      const benefit = await prisma.benefit.create({
        data: {
          employeeId: input.employeeId,
          benefitType: input.benefitType as BenefitType,
          amount: input.amount,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
        },
      });

      await logAction("Benefit", benefit.id, "Create", ctx.userId || null, input);
      
      return JSON.stringify(benefit, null, 2);
    },
  }),

  updateBenefit: tool({
    description: "Update benefit details.",
    inputSchema: z.object({
      benefitId: z.string().describe("Benefit ID"),
      benefitType: z.enum(["Insurance", "Housing", "Transport", "Other"]).optional(),
      amount: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'update', 'benefit', ctx.userId);

      const updateData: any = {};
      if (input.benefitType !== undefined) updateData.benefitType = input.benefitType as BenefitType;
      if (input.amount !== undefined) updateData.amount = input.amount;
      if (input.startDate !== undefined) updateData.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;

      const benefit = await prisma.benefit.update({
        where: { id: input.benefitId },
        data: updateData,
      });

      await logAction("Benefit", benefit.id, "Update", ctx.userId || null, input);
      
      return JSON.stringify(benefit, null, 2);
    },
  }),

  getBenefits: tool({
    description: "Retrieve all benefits for an employee.",
    inputSchema: z.object({
      employeeId: z.string().describe("Employee ID"),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      requirePermission(ctx.role, 'read', 'benefit', ctx.userId);

      const benefits = await prisma.benefit.findMany({
        where: { employeeId: input.employeeId },
        orderBy: { startDate: 'desc' },
      });

      return JSON.stringify(benefits, null, 2);
    },
  }),
};

// Audit Tools
export const auditTools = {
  getAuditLogs: tool({
    description: "Retrieve audit logs with optional filters (entity type, user, date range).",
    inputSchema: z.object({
      entityType: z.enum(["Employee", "Contract", "AdministrativeLetter", "AttendanceRecord", "Payroll", "Benefit", "User"]).optional(),
      entityId: z.string().optional(),
      userId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional().default(50),
    }),
    execute: async (input) => {
      const ctx = getToolContext();
      // Only HR_Admin can view audit logs
      if (ctx.role !== "HR_Admin") {
        throw new Error("Unauthorized: Only HR Admin can view audit logs");
      }

      const { getAuditLogs } = await import("@/lib/audit/logger");
      const logs = await getAuditLogs({
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
      });

      return JSON.stringify(logs, null, 2);
    },
  }),
};

// Combine all tools
export const hrTools = {
  ...employeeTools,
  ...contractTools,
  ...letterTools,
  ...attendanceTools,
  ...payrollTools,
  ...benefitTools,
  ...auditTools,
} satisfies ToolSet;

export type HRTools = typeof hrTools;


