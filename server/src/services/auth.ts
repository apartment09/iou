import type { RegisterInput, UserDto } from '@splitt/shared';
import type { Db } from '../db/connection.js';
import { conflict, unauthorized } from '../errors.js';
import { hashToken, isoInDays, newToken, nowIso } from '../util.js';
import type { SessionRepository } from '../repositories/sessions.js';
import type { UserRepository } from '../repositories/users.js';
import { hashPassword, verifyPassword } from './passwords.js';
import type { InviteService } from './invites.js';
import { config } from '../config.js';

export interface SessionResult {
  user: UserDto;
  token: string;
  expiresAt: string;
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly invites: InviteService,
  ) {}

  needsSetup(): boolean {
    return this.users.count() === 0;
  }

  /** Invite-only registration. The very first user may register without a token. */
  register(input: RegisterInput): SessionResult {
    const now = nowIso();
    const user = this.db.transaction(() => {
      const invite = this.needsSetup() ? null : this.invites.validateForRegistration(input.token);
      if (this.users.findByEmail(input.email)) {
        throw conflict('An account with this email already exists');
      }
      const created = this.users.create(input.email, input.name, hashPassword(input.password), now);
      if (invite) this.invites.consumeForNewUser(invite, created.id, now);
      return created;
    })();
    return this.createSession(user);
  }

  login(email: string, password: string): SessionResult {
    const row = this.users.findByEmail(email);
    // Same error for unknown email and wrong password — no account enumeration.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw unauthorized('Wrong email or password');
    }
    return this.createSession({ id: row.id, email: row.email, name: row.name });
  }

  logout(token: string): void {
    this.sessions.delete(hashToken(token));
  }

  userForToken(token: string): UserDto | undefined {
    return this.sessions.findUser(hashToken(token), nowIso());
  }

  private createSession(user: UserDto): SessionResult {
    const token = newToken();
    const expiresAt = isoInDays(config.sessionTtlDays);
    this.sessions.create(hashToken(token), user.id, nowIso(), expiresAt);
    return { user, token, expiresAt };
  }
}
