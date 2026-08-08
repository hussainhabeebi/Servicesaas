/** Shared brute-force lockout policy for both tenant (routes/auth.ts) and platform admin (routes/admin-auth.ts) logins. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export function isLocked(lockedUntil: string | null | undefined): boolean {
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
}

/** Call after a failed password check — bumps the counter and sets a cooldown once the threshold is hit. */
export function nextLockoutState(failedAttempts: number): { failed_login_attempts: number; locked_until: string | null } {
  const failed = failedAttempts + 1;
  if (failed >= MAX_FAILED_ATTEMPTS) {
    return { failed_login_attempts: failed, locked_until: new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() };
  }
  return { failed_login_attempts: failed, locked_until: null };
}

export const clearedLockoutState = { failed_login_attempts: 0, locked_until: null as string | null };
