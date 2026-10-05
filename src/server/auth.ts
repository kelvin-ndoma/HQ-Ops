import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { isRole, type Role } from "../domain/permissions";
import { connectDB } from "./db";
import { AppError } from "./errors";
import { User } from "./models";

const COOKIE = "hq_session";
const attempts = new Map<string, { count: number; reset: number }>();

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET must be set to a long random string.");
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

const REMEMBER_SECONDS = 60 * 60 * 24 * 30;
const SESSION_SECONDS = 60 * 60 * 12;

export async function signToken(
  user: { id: string; role: string; tokenVersion: number; name: string; email: string },
  remember = false,
) {
  return new SignJWT({
    role: user.role,
    tv: user.tokenVersion,
    name: user.name,
    email: user.email,
    rm: remember,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(remember ? "30d" : "12h")
    .sign(secret());
}

export async function readToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return payload;
}

function registerFailure(email: string) {
  const key = email.toLowerCase();
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset < now) {
    attempts.set(key, { count: 1, reset: now + 15 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

function assertNotLimited(email: string) {
  const current = attempts.get(email.toLowerCase());
  if (current && current.reset > Date.now() && current.count >= 8) {
    throw new AppError("Too many sign-in attempts. Wait a few minutes and try again.");
  }
}

export async function authenticate(email: string, password: string) {
  assertNotLimited(email);
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase(), archivedAt: null });
  const matches = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || user.status !== "active" || !user.active || !user.passwordHash || !matches) {
    registerFailure(email);
    throw new AppError("Those details do not match an active account.");
  }
  attempts.delete(email.toLowerCase());
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function setSessionCookie(token: string, remember = false) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? REMEMBER_SECONDS : SESSION_SECONDS,
  });
}

export async function currentSessionRemembers() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  try {
    const payload = await readToken(token);
    return payload.rm === true;
  } catch {
    return false;
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  await connectDB();
  const user = await User.findById(userId);
  if (!user || !user.active || user.archivedAt) throw new AppError("Account not found.", "not_found");
  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) throw new AppError("The current password is not right.");
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();
  return user;
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function isSessionCurrent(user: { active: boolean; archivedAt?: Date | null; tokenVersion: number; status?: string | null }, tokenVersion: number) {
  const status = user.status || (user.active ? "active" : "deactivated");
  if (!user.active || user.archivedAt || status !== "active") return false;
  return user.tokenVersion === tokenVersion;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = await readToken(token);
    if (!payload.sub || !isRole(String(payload.role))) return null;
    await connectDB();
    const user = await User.findById(payload.sub);
    if (!user || !isSessionCurrent(user, Number(payload.tv))) return null;
    return { id: String(user._id), name: user.name, email: user.email, role: user.role as Role };
  } catch {
    return null;
  }
}
