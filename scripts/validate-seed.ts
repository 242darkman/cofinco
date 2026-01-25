/**
 * COFINCO - Seed Validation Script
 *
 * Validates that the database has all required data for production.
 * Run after seed or anytime to check database health.
 *
 * Usage: pnpm db:validate
 */

import { db } from '../server/db';
import { eq, count, and, isNull } from 'drizzle-orm';
import {
  users,
  userRoles,
  modules,
  permissions,
  rolePermissions,
  agences,
  zones,
  systemSettings,
  securitySettings,
  planComptable,
  journaux,
  exercices,
  coffresForts,
  comptesLiaison,
  caisses,
  maintenanceModules,
} from '@shared/schema';
import { departments, jobPositions, employes, payrollConfig } from '@shared/schema';
import { SystemRole } from '@shared/types/roles';
import { MODULES_DATA } from '@shared/config/rbac';

interface ValidationResult {
  invariant: string;
  passed: boolean;
  details?: string;
  severity: 'critical' | 'warning' | 'info';
}

async function validateSeed(): Promise<ValidationResult[]> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 COFINCO - Seed Validation');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results: ValidationResult[] = [];

  // ============================================
  // CRITICAL - Application won't start without these
  // ============================================

  // 1. Agence Siège exists
  const [siege] = await db.select().from(agences).where(eq(agences.codeAgence, 'SIEGE'));
  results.push({
    invariant: 'Agence Siège exists (SIEGE)',
    passed: !!siege,
    details: siege ? `ID: ${siege.id}` : 'NOT FOUND',
    severity: 'critical'
  });

  // 2. At least 1 zone exists
  const [zoneCount] = await db.select({ count: count() }).from(zones);
  results.push({
    invariant: 'At least 1 zone exists',
    passed: zoneCount.count > 0,
    details: `count=${zoneCount.count}`,
    severity: 'critical'
  });

  // 3. Admin user exists with canLogin
  const [admin] = await db.select().from(users).where(eq(users.username, 's.administrateur'));
  results.push({
    invariant: 'Admin user (s.administrateur) exists with canLogin=true',
    passed: !!admin && admin.canLogin === true,
    details: admin ? `canLogin=${admin.canLogin}, statut=${admin.statut}` : 'NOT FOUND',
    severity: 'critical'
  });

  // 4. userRoles contains ADMIN with isPrimary=true
  if (admin) {
    const [adminRole] = await db.select().from(userRoles).where(
      and(eq(userRoles.userId, admin.id), eq(userRoles.role, SystemRole.ADMIN))
    );
    results.push({
      invariant: 'userRoles contains ADMIN role with isPrimary=true',
      passed: !!adminRole && adminRole.isPrimary === true,
      details: adminRole ? `isPrimary=${adminRole.isPrimary}` : 'NOT FOUND',
      severity: 'critical'
    });
  } else {
    results.push({
      invariant: 'userRoles contains ADMIN role with isPrimary=true',
      passed: false,
      details: 'Admin user not found',
      severity: 'critical'
    });
  }

  // 5. systemSettings exists
  const [sysSettings] = await db.select().from(systemSettings);
  results.push({
    invariant: 'systemSettings exists',
    passed: !!sysSettings,
    details: sysSettings ? `agenceName=${sysSettings.agenceName}` : 'NOT FOUND',
    severity: 'critical'
  });

  // 6. securitySettings exists with valid passwordMinLength
  const [secSettings] = await db.select().from(securitySettings);
  results.push({
    invariant: 'securitySettings exists with passwordMinLength >= 8',
    passed: !!secSettings && secSettings.passwordMinLength >= 8,
    details: secSettings ? `passwordMinLength=${secSettings.passwordMinLength}` : 'NOT FOUND',
    severity: 'critical'
  });

  // 7. Modules >= 30 (RBAC)
  const [moduleCount] = await db.select({ count: count() }).from(modules);
  results.push({
    invariant: 'RBAC modules >= 30',
    passed: moduleCount.count >= 30,
    details: `count=${moduleCount.count}`,
    severity: 'critical'
  });

  // 8. Permissions >= 100
  const [permCount] = await db.select({ count: count() }).from(permissions);
  results.push({
    invariant: 'RBAC permissions >= 100',
    passed: permCount.count >= 100,
    details: `count=${permCount.count}`,
    severity: 'critical'
  });

  // 9. rolePermissions for ADMIN exist
  const [adminPermCount] = await db.select({ count: count() }).from(rolePermissions)
    .where(eq(rolePermissions.role, SystemRole.ADMIN));
  results.push({
    invariant: 'ADMIN role has permissions assigned',
    passed: adminPermCount.count >= 100,
    details: `count=${adminPermCount.count}`,
    severity: 'critical'
  });

  // ============================================
  // WARNING - Features may not work without these
  // ============================================

  // 10. Exercice comptable OPEN exists
  const currentYear = new Date().getFullYear();
  const [exercice] = await db.select().from(exercices).where(eq(exercices.statut, 'OPEN'));
  results.push({
    invariant: `Exercice comptable OPEN exists (${currentYear})`,
    passed: !!exercice,
    details: exercice ? `code=${exercice.code}` : 'NOT FOUND',
    severity: 'warning'
  });

  // 11. Plan comptable >= 30 comptes
  const [planCount] = await db.select({ count: count() }).from(planComptable);
  results.push({
    invariant: 'Plan comptable >= 30 accounts',
    passed: planCount.count >= 30,
    details: `count=${planCount.count}`,
    severity: 'warning'
  });

  // 12. Journaux >= 5
  const [journauxCount] = await db.select({ count: count() }).from(journaux);
  results.push({
    invariant: 'Journaux comptables >= 5',
    passed: journauxCount.count >= 5,
    details: `count=${journauxCount.count}`,
    severity: 'warning'
  });

  // 13. Coffre CF-SIEGE exists
  const [coffre] = await db.select().from(coffresForts).where(eq(coffresForts.code, 'CF-SIEGE'));
  results.push({
    invariant: 'Coffre-Fort CF-SIEGE exists',
    passed: !!coffre,
    details: coffre ? `solde=${coffre.solde} XAF` : 'NOT FOUND',
    severity: 'warning'
  });

  // 14. Compte liaison exists
  const [liaison] = await db.select().from(comptesLiaison).where(eq(comptesLiaison.code, 'LIAISON-SIEGE'));
  results.push({
    invariant: 'Compte liaison LIAISON-SIEGE exists',
    passed: !!liaison,
    details: liaison ? `numeroComptable=${liaison.numeroComptable}` : 'NOT FOUND',
    severity: 'warning'
  });

  // 15. Caisse du siège exists
  if (siege) {
    const [caisse] = await db.select().from(caisses).where(eq(caisses.agenceId, siege.id));
    results.push({
      invariant: 'Caisse du siège exists',
      passed: !!caisse,
      details: caisse ? `nom=${caisse.nom}` : 'NOT FOUND',
      severity: 'warning'
    });
  }

  // 16. Departments >= 5
  const [deptCount] = await db.select({ count: count() }).from(departments);
  results.push({
    invariant: 'Departments >= 5',
    passed: deptCount.count >= 5,
    details: `count=${deptCount.count}`,
    severity: 'warning'
  });

  // 17. JobPositions >= 10
  const [jobCount] = await db.select({ count: count() }).from(jobPositions);
  results.push({
    invariant: 'JobPositions >= 10',
    passed: jobCount.count >= 10,
    details: `count=${jobCount.count}`,
    severity: 'warning'
  });

  // 18. payrollConfig global exists
  const [payroll] = await db.select().from(payrollConfig).where(isNull(payrollConfig.agenceId));
  results.push({
    invariant: 'payrollConfig global exists',
    passed: !!payroll,
    details: payroll ? `cnssEmployeeRate=${payroll.cnssEmployeeRate}` : 'NOT FOUND',
    severity: 'warning'
  });

  // 19. Admin has employe record
  if (admin) {
    const [adminEmploye] = await db.select().from(employes).where(eq(employes.userId, admin.id));
    results.push({
      invariant: 'Admin has employe record',
      passed: !!adminEmploye,
      details: adminEmploye ? `matricule=${adminEmploye.matricule}` : 'NOT FOUND',
      severity: 'warning'
    });
  }

  // ============================================
  // INFO - Nice to have
  // ============================================

  // 20. maintenanceModules sync with RBAC
  const [maintenanceCount] = await db.select({ count: count() }).from(maintenanceModules);
  results.push({
    invariant: 'maintenanceModules synced with RBAC modules',
    passed: maintenanceCount.count >= MODULES_DATA.length,
    details: `count=${maintenanceCount.count} vs ${MODULES_DATA.length} RBAC modules`,
    severity: 'info'
  });

  return results;
}

async function main() {
  try {
    const results = await validateSeed();

    // Group by severity
    const critical = results.filter(r => r.severity === 'critical');
    const warnings = results.filter(r => r.severity === 'warning');
    const info = results.filter(r => r.severity === 'info');

    // Print results
    console.log('🔴 CRITICAL (App won\'t start without these):');
    console.log('───────────────────────────────────────────────────────────────');
    for (const r of critical) {
      const status = r.passed ? '✅' : '❌';
      console.log(`${status} ${r.invariant}`);
      if (r.details) console.log(`   ${r.details}`);
    }

    console.log('\n🟡 WARNING (Features may not work):');
    console.log('───────────────────────────────────────────────────────────────');
    for (const r of warnings) {
      const status = r.passed ? '✅' : '⚠️';
      console.log(`${status} ${r.invariant}`);
      if (r.details) console.log(`   ${r.details}`);
    }

    console.log('\n🔵 INFO (Nice to have):');
    console.log('───────────────────────────────────────────────────────────────');
    for (const r of info) {
      const status = r.passed ? '✅' : 'ℹ️';
      console.log(`${status} ${r.invariant}`);
      if (r.details) console.log(`   ${r.details}`);
    }

    // Summary
    const criticalFailed = critical.filter(r => !r.passed).length;
    const warningsFailed = warnings.filter(r => !r.passed).length;
    const totalPassed = results.filter(r => r.passed).length;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total checks: ${results.length}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Critical failed: ${criticalFailed}`);
    console.log(`Warnings: ${warningsFailed}`);

    if (criticalFailed > 0) {
      console.log('\n❌ VALIDATION FAILED - Critical issues detected!');
      console.log('   Run: pnpm db:seed:prod:v2 to fix');
      process.exit(1);
    } else if (warningsFailed > 0) {
      console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS');
      console.log('   Some features may not work correctly.');
      process.exit(0);
    } else {
      console.log('\n✅ ALL VALIDATIONS PASSED');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Validation error:', error);
    process.exit(1);
  }
}

main();
