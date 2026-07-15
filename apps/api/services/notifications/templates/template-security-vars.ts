/**
 * Variables de rendu pour l'identité, les accès et les permissions temporaires.
 */
export interface OtpCodeVars {
  otpCode: string;
  expiryMinutes: number;
  purpose?: string;
  userName?: string;
}

export interface TempPermissionGrantedVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiresAt: string;
  reason: string;
  grantedBy: string;
}

export interface TempPermissionExpiringVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiresAt: string;
  timeRemaining: string;
}

export interface TempPermissionExpiredVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  expiredAt: string;
}

export interface TempPermissionRevokedVars {
  userName: string;
  permissionName: string;
  permissionCode: string;
  revokedBy: string;
  reason?: string;
}

export interface WelcomeVars {
  clientName: string;
  appName?: string;
}

export interface PasswordResetVars {
  userName: string;
  otpCode: string;
  expiryMinutes: number;
}

export interface AccessCodeGeneratedVars {
  userName: string;
  code: string;
  validityHours: string;
  authorizationHours: string;
  codeType: string;
  description?: string;
}

export interface AccessCodeExpiringVars {
  userName: string;
  code: string;
  expiresAt: string;
  timeRemaining: string;
}

export interface SessionForceClosedVars {
  sessionsCount: string;
  details: string;
}

export interface ClientWelcomeVars {
  clientName: string;
  appName?: string;
  accountNumber?: string;
}

export interface UserRegisteredVars {
  userName: string;
  username: string;
}

export interface UserPasswordChangedVars {
  userName: string;
}

export interface EmployeeWelcomeVars {
  employeeName: string;
  matricule: string;
  username?: string;
  appName?: string;
}
