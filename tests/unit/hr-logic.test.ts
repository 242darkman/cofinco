import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMonthlyPaie, checkOut, getOrganigramme } from '../../server/storage/hr';
import { db } from '../../server/db';
import { InsertBulletinPaie } from '../../shared/schema';

// Mock DB
vi.mock('../../server/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}));

// Helper to mock chainable query builder
const mockQueryBuilder = (result: any) => {
  const query = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
    then: (resolve: any) => resolve(result),
  };
  return query;
};

// Also mock select to simple return promise for non-chained calls if needed
// Or make select return the chainable object
(db.select as any).mockImplementation(() => mockQueryBuilder([]));

describe('HR Logic Unit Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateMonthlyPaie', () => {
    it('should calculate monthly salary correctly (Mode Mensuel)', async () => {
      // Data
      const mockEmployees = [{
        employeId: 'emp-1',
        userId: 'user-1',
        nom: 'Mbemba',
        prenom: 'Jean',
        salaireBase: 500000,
        tauxHoraire: 0,
        tauxJournalier: 0,
        modeCalculPaie: 'Mensuel'
      }];

      const mockPresences: any[] = []; // Presences don't matter for fixed monthly

      // Mocks
      // 1. select employees
      const q1 = mockQueryBuilder(mockEmployees);
      (db.select as any).mockReturnValueOnce(q1);

      // 2. check existing bulletins (empty)
      const q2 = mockQueryBuilder([]);
      (db.select as any).mockReturnValueOnce(q2);

      // 3. fetch presences
      const q3 = mockQueryBuilder(mockPresences);
      (db.select as any).mockReturnValueOnce(q3);

      // 4. insert return
      const mockInsertedBulletin = { id: 1, salaireNet: '400000' }; // Dummy return
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockInsertedBulletin])
        })
      });

      // Execute
      await generateMonthlyPaie('2026-01', 'admin-id');

      // Verify Insert called with correct calculations
      const insertCall = (db.insert as any).mock.results[0].value.values.mock.calls[0][0];
      
      // Expected calculations:
      // Base: 500000
      // Transport: 50000
      // Brut: 550000
      // CNSS (5%): 27500
      // IPR (15%): 82500
      // Total Retenues: 110000
      // Net: 440000
      
      expect(insertCall.salaireBrut).toBe('550000');
      expect(insertCall.cnssEmploye).toBe('27500');
      expect(insertCall.ipr).toBe('82500');
      expect(insertCall.salaireNet).toBe('440000');
    });

    it('should calculate hourly salary correctly', async () => {
        // Data
        const mockEmployees = [{
          employeId: 'emp-2',
          userId: 'user-2',
          nom: 'Ngoma',
          prenom: 'Paul',
          salaireBase: 0,
          tauxHoraire: 2000,
          tauxJournalier: 0,
          modeCalculPaie: 'Horaire'
        }];
  
        // 100 hours worked + 10 overtime
        const mockPresences = [
            { heuresTravaillees: 480, heuresSupplementaires: 60 }, // Day 1
            // ... simplify: assume aggregated or single entry representing multiple days for unit test logic check
        ]; 
        // Logic sums up all entries. Let's make it simpler:
        // 10 entries of 10 hours (600 mins) = 6000 mins = 100 hours
        // But logic sums minutes then divides by 60.
        // Let's pass one fake big presence entry
        const bigPresence = { heuresTravaillees: 6000, heuresSupplementaires: 600 }; // 100h normal, 10h supp
  
        // Mocks
        // 1. select employees
        (db.select as any).mockReturnValueOnce(mockQueryBuilder(mockEmployees));
        // 2. check existing (empty)
        (db.select as any).mockReturnValueOnce(mockQueryBuilder([]));
        // 3. presences
        (db.select as any).mockReturnValueOnce(mockQueryBuilder([bigPresence]));
  
        // 4. insert return
        (db.insert as any).mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{}])
          })
        });
  
        // Execute
        await generateMonthlyPaie('2026-01', 'admin-id');
  
        // Verify
        const insertCall = (db.insert as any).mock.results[0].value.values.mock.calls[0][0];
        
        // Calcs:
        // Normal: 100h * 2000 = 200,000
        // Supp: 10h * 2000 * 1.5 = 30,000
        // Total Salaire: 230,000
        // Transport: 50,000
        // Brut: 280,000
        
        expect(insertCall.salaireBrut).toBe('280000');
    });
  });

  describe('checkOut', () => {
    it('should calculate worked hours and overtime correctly', async () => {
        const employeId = 'emp-1';
        const now = new Date('2026-01-11T18:00:00');
        vi.setSystemTime(now);

        // Arrived at 8:00 (10 hours ago = 600 mins)
        // Pause 12:00 to 13:00 (60 mins)
        const mockPresence = {
            id: 1,
            heureArrivee: new Date('2026-01-11T08:00:00'),
            pauseDebut: new Date('2026-01-11T12:00:00'),
            pauseFin: new Date('2026-01-11T13:00:00')
        };

        // Mocks
        // 1. find existing presence
        (db.select as any).mockReturnValueOnce(mockQueryBuilder([mockPresence]));
        // 2. find horaires (empty -> default 60 min pause used if real pause not found, but here real pause is found)
        (db.select as any).mockReturnValueOnce(mockQueryBuilder([]));

        // 3. Update return
        (db.update as any).mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([{ ...mockPresence, heureDepart: now }])
                })
            })
        });

        // Execute
        await checkOut(employeId);

        // Verify update args
        // Total duration: 10h = 600m
        // Pause: 1h = 60m
        // Worked: 540m
        // Standard: 8h = 480m
        // Overtime: 540 - 480 = 60m
        
        const updateCall = (db.update as any).mock.results[0].value.set.mock.calls[0][0];
        
        expect(updateCall.heuresTravaillees).toBe(540);
        expect(updateCall.heuresSupplementaires).toBe(60);

        vi.useRealTimers();
    });
  });
  
  describe('getOrganigramme', () => {
      it('should build a nested tree structure', async () => {
          const flatEmployees = [
              { employeId: 'boss', nom: 'Boss', managerId: null },
              { employeId: 'manager', nom: 'Manager', managerId: 'boss' },
              { employeId: 'worker', nom: 'Worker', managerId: 'manager' }
          ];
          
          // data returned by join query includes user fields
          const mockDbResult = flatEmployees.map(e => ({
              ...e,
              userId: 'u-'+e.employeId,
              prenom: '',
              poste: 'Role',
              departement: 'Dept'
          }));

          (db.select as any).mockReturnValue(mockQueryBuilder(mockDbResult));

          const result = await getOrganigramme();

          expect(result).toHaveLength(1);
          expect(result[0].id).toBe('boss');
          expect(result[0].subordinates).toHaveLength(1);
          expect(result[0].subordinates[0].id).toBe('manager');
          expect(result[0].subordinates[0].subordinates).toHaveLength(1);
          expect(result[0].subordinates[0].subordinates[0].id).toBe('worker');
      });
  });

});
