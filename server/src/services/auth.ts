import type { CreateUserInput, RegisterInput, UserDto } from '@iou/shared';
import { conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { hashToken, isoInDays, newToken, nowIso } from '../util.js';
import type { SessionRepository } from '../repositories/sessions.js';
import type { UserRepository } from '../repositories/users.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { config } from '../config.js';

export interface SessionResult {
  user: UserDto;
  token: string;
  expiresAt: string;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  needsSetup(): boolean {
    return this.users.count() === 0;
  }

  /** Self-registration exists only to bootstrap: the first account becomes
   * the admin. Every later account is created by the admin. */
  register(input: RegisterInput): SessionResult {
    if (!this.needsSetup()) {
      throw forbidden('Registration is closed — ask the admin for an account');
    }
    const user = this.users.create(
      input.username,
      input.name,
      hashPassword(input.password),
      true,
      nowIso(),
    );
    return this.createSession(user);
  }

  createUser(actor: UserDto, input: CreateUserInput): UserDto {
    this.requireAdmin(actor);
    if (this.users.findByUsername(input.username)) {
      throw conflict('This username is already taken');
    }
    return this.users.create(input.username, input.name, hashPassword(input.password), false, nowIso());
  }

  listUsers(actor: UserDto): UserDto[] {
    this.requireAdmin(actor);
    return this.users.list();
  }

  resetPassword(actor: UserDto, userId: number, password: string): void {
    this.requireAdmin(actor);
    const user = this.users.findById(userId);
    if (!user) throw notFound('User not found');
    this.users.updatePassword(userId, hashPassword(password));
  }

  login(username: string, password: string): SessionResult {
    const row = this.users.findByUsername(username);
    // Same error for unknown username and wrong password — no account enumeration.
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw unauthorized('Wrong username or password');
    }
    return this.createSession(this.users.toDto(row));
  }

  changePassword(user: UserDto, currentPassword: string, newPassword: string): void {
    const row = this.users.findById(user.id);
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw unauthorized('Current password is wrong');
    }
    this.users.updatePassword(user.id, hashPassword(newPassword));
  }

  logout(token: string): void {
    this.sessions.delete(hashToken(token));
  }

  userForToken(token: string): UserDto | undefined {
    return this.sessions.findUser(hashToken(token), nowIso());
  }

  private requireAdmin(actor: UserDto): void {
    if (!actor.isAdmin) throw forbidden('Only the admin can manage accounts');
  }

  private createSession(user: UserDto): SessionResult {
    const token = newToken();
    const expiresAt = isoInDays(config.sessionTtlDays);
    this.sessions.create(hashToken(token), user.id, nowIso(), expiresAt);
    return { user, token, expiresAt };
  }
}
