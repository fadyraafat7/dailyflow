import crypto from 'crypto';

/**
 * A short, URL-safe random password suitable for one-time distribution:
 * shown once (in a bootstrap console message, or in an admin's "add team
 * member" / "reset password" response) to whoever is responsible for
 * relaying it to the account's actual owner, then never displayed again.
 * Shared by src/index.ts (the default Owner account) and the team
 * controller (new Team Lead/Employee accounts, password resets) so both
 * paths generate passwords the same way.
 */
export function generateRandomPassword(): string {
  return crypto.randomBytes(9).toString('base64url');
}
