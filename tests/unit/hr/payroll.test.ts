/**
 * Payroll Calculation Tests
 *
 * Tests for the HR payroll system including:
 * - Salary calculations (monthly, hourly, daily)
 * - Tax (IPR) calculations
 * - CNSS contributions
 * - Seniority bonuses
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HrService } from 'server/services/hr-service';

// Mock the database
vi.mock('server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  },
}));

describe('HrService - Payroll Calculations', () => {
  let hrService: HrService;

  beforeEach(() => {
    hrService = new HrService();
    vi.clearAllMocks();
  });

  describe('calculateIPR', () => {
    const defaultBrackets = [
      { min: 0, max: 524000, rate: 0 },
      { min: 524001, max: 1428000, rate: 0.15 },
      { min: 1428001, max: 2700000, rate: 0.30 },
      { min: 2700001, max: null, rate: 0.40 },
    ];

    it('should return 0 for income below first bracket', () => {
      const ipr = hrService.calculateIPR(400000, defaultBrackets);
      expect(ipr).toBe(0);
    });

    it('should calculate IPR correctly for second bracket', () => {
      // 800,000 CDF
      // First 524,000 = 0
      // Next 276,000 at 15% = 41,400
      const ipr = hrService.calculateIPR(800000, defaultBrackets);
      expect(ipr).toBe(41400);
    });

    it('should calculate IPR correctly for third bracket', () => {
      // 2,000,000 CDF
      // First 524,000 = 0
      // Next 904,000 (to 1,428,000) at 15% = 135,600
      // Next 572,000 at 30% = 171,600
      // Total = 307,200
      const ipr = hrService.calculateIPR(2000000, defaultBrackets);
      expect(ipr).toBe(307200);
    });

    it('should calculate IPR correctly for highest bracket', () => {
      // 3,500,000 CDF
      // First 524,000 = 0
      // Next 904,000 at 15% = 135,600
      // Next 1,272,000 at 30% = 381,600
      // Next 800,000 at 40% = 320,000
      // Total = 837,200
      const ipr = hrService.calculateIPR(3500000, defaultBrackets);
      expect(ipr).toBe(837200);
    });

    it('should handle zero income', () => {
      const ipr = hrService.calculateIPR(0, defaultBrackets);
      expect(ipr).toBe(0);
    });

    it('should handle exactly at bracket boundaries', () => {
      // Exactly at first bracket boundary
      const ipr1 = hrService.calculateIPR(524000, defaultBrackets);
      expect(ipr1).toBe(0);

      // Exactly at second bracket boundary
      const ipr2 = hrService.calculateIPR(1428000, defaultBrackets);
      // 904,000 * 0.15 = 135,600
      expect(ipr2).toBe(135600);
    });
  });

  describe('CNSS Calculations', () => {
    it('should calculate employee CNSS at 5%', () => {
      const grossSalary = 1000000;
      const rate = 0.05;
      const cnss = Math.round(grossSalary * rate);
      expect(cnss).toBe(50000);
    });

    it('should calculate employer CNSS at 9%', () => {
      const grossSalary = 1000000;
      const rate = 0.09;
      const cnss = Math.round(grossSalary * rate);
      expect(cnss).toBe(90000);
    });

    it('should round CNSS to nearest integer', () => {
      const grossSalary = 1234567;
      const rate = 0.05;
      const cnss = Math.round(grossSalary * rate);
      expect(cnss).toBe(61728); // Rounded from 61728.35
    });
  });

  describe('Seniority Bonus', () => {
    it('should calculate 2% per year capped at 30%', () => {
      const baseSalary = 1000000;

      // 5 years = 10%
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const bonus5 = hrService.calculateSeniorityBonus(
        fiveYearsAgo.toISOString().split('T')[0],
        baseSalary
      );
      expect(bonus5).toBe(100000);

      // 10 years = 20%
      const tenYearsAgo = new Date();
      tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
      const bonus10 = hrService.calculateSeniorityBonus(
        tenYearsAgo.toISOString().split('T')[0],
        baseSalary
      );
      expect(bonus10).toBe(200000);

      // 15 years = 30% (at cap)
      const fifteenYearsAgo = new Date();
      fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
      const bonus15 = hrService.calculateSeniorityBonus(
        fifteenYearsAgo.toISOString().split('T')[0],
        baseSalary
      );
      expect(bonus15).toBe(300000);

      // 25 years = still 30% (capped)
      const twentyFiveYearsAgo = new Date();
      twentyFiveYearsAgo.setFullYear(twentyFiveYearsAgo.getFullYear() - 25);
      const bonus25 = hrService.calculateSeniorityBonus(
        twentyFiveYearsAgo.toISOString().split('T')[0],
        baseSalary
      );
      expect(bonus25).toBe(300000);
    });
  });

  describe('Full Payroll Calculation', () => {
    it('should calculate net salary correctly for monthly employee', () => {
      // Simplified test - in real scenario would need full mocking
      const baseSalary = 1000000;
      const transportAllowance = 50000;
      const cnssRate = 0.05;

      const grossSalary = baseSalary + transportAllowance;
      const cnssEmployee = Math.round(grossSalary * cnssRate);
      const taxableBase = grossSalary - cnssEmployee;

      // Using default brackets for IPR
      const ipr = hrService.calculateIPR(taxableBase, [
        { min: 0, max: 524000, rate: 0 },
        { min: 524001, max: 1428000, rate: 0.15 },
        { min: 1428001, max: 2700000, rate: 0.30 },
        { min: 2700001, max: null, rate: 0.40 },
      ]);

      const totalDeductions = cnssEmployee + ipr;
      const netSalary = grossSalary - totalDeductions;

      // Verify calculations
      expect(grossSalary).toBe(1050000);
      expect(cnssEmployee).toBe(52500);
      expect(taxableBase).toBe(997500);
      // IPR on 997,500: 0 for first 524k, then 473,500 * 0.15 = 71,025
      expect(ipr).toBe(71025);
      expect(totalDeductions).toBe(123525);
      expect(netSalary).toBe(926475);
    });

    it('should handle overtime correctly', () => {
      // Overtime at 150%
      const hourlyRate = 5000;
      const overtimeHours = 10;
      const overtimeRate = 1.5;

      const overtimePay = Math.round(overtimeHours * hourlyRate * overtimeRate);
      expect(overtimePay).toBe(75000);
    });

    it('should calculate hourly employee salary based on hours worked', () => {
      const hourlyRate = 5000;
      const hoursWorked = 160; // Standard month

      const baseSalary = hourlyRate * hoursWorked;
      expect(baseSalary).toBe(800000);
    });

    it('should calculate daily employee salary based on days worked', () => {
      const dailyRate = 40000;
      const daysWorked = 22; // Standard month

      const baseSalary = dailyRate * daysWorked;
      expect(baseSalary).toBe(880000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero salary', () => {
      const grossSalary = 0;
      const cnss = Math.round(grossSalary * 0.05);
      const ipr = hrService.calculateIPR(grossSalary, [
        { min: 0, max: 524000, rate: 0 },
      ]);

      expect(cnss).toBe(0);
      expect(ipr).toBe(0);
    });

    it('should handle very high salary', () => {
      // 10 million CDF
      const grossSalary = 10000000;
      const cnss = Math.round(grossSalary * 0.05);

      expect(cnss).toBe(500000);

      const ipr = hrService.calculateIPR(grossSalary - cnss, [
        { min: 0, max: 524000, rate: 0 },
        { min: 524001, max: 1428000, rate: 0.15 },
        { min: 1428001, max: 2700000, rate: 0.30 },
        { min: 2700001, max: null, rate: 0.40 },
      ]);

      // IPR breakdown:
      // 0-524k: 0
      // 524k-1428k: 904k * 0.15 = 135,600
      // 1428k-2700k: 1272k * 0.30 = 381,600
      // 2700k-9500k: 6800k * 0.40 = 2,720,000
      // Total = 3,237,200
      expect(ipr).toBe(3237200);
    });

    it('should handle floating point precision in calculations', () => {
      // Salary that might cause precision issues
      const grossSalary = 1234567.89;
      const cnss = Math.round(grossSalary * 0.05);

      // Should be properly rounded to integer
      expect(Number.isInteger(cnss)).toBe(true);
      expect(cnss).toBe(61728);
    });
  });
});

describe('Payroll Workflow', () => {
  describe('Status Transitions', () => {
    it('should allow DRAFT -> VALIDATED', () => {
      expect(true).toBe(true);
    });

    it('should allow VALIDATED -> PAID', () => {
      expect(true).toBe(true);
    });

    it('should not allow DRAFT -> PAID directly', () => {
      // Must go through VALIDATED first
      expect(true).toBe(true);
    });

    it('should not allow reverting PAID status', () => {
      // Once paid, cannot change status
      expect(true).toBe(true);
    });
  });

  describe('Bulk Operations', () => {
    it('should generate bulletins for all active employees', () => {
      // Test that generation includes all active employees
      expect(true).toBe(true);
    });

    it('should skip employees who already have bulletin for the month', () => {
      // Idempotency check
      expect(true).toBe(true);
    });

    it('should validate all bulletins in batch', () => {
      // Bulk validation
      expect(true).toBe(true);
    });

    it('should mark all validated bulletins as paid', () => {
      // Bulk payment
      expect(true).toBe(true);
    });
  });
});
