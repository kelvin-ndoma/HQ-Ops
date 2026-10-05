"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { loginSchema } from "@/domain/schemas";
import { authenticate, setSessionCookie, signToken } from "@/server/auth";
import { AppError } from "@/server/errors";

export async function loginAction(_prev: { error?: string }, formData: FormData) {
  try {
    const parsed = loginSchema.parse({
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
    });
    const user = await authenticate(parsed.email, parsed.password);
    const remember = formData.get("remember") === "on";
    const token = await signToken({
      id: String(user._id),
      role: user.role,
      tokenVersion: user.tokenVersion,
      name: user.name,
      email: user.email,
    }, remember);
    await setSessionCookie(token, remember);
  } catch (error) {
    if (error instanceof ZodError) return { error: "Enter the email and password for your HQ account." };
    if (error instanceof AppError) return { error: error.message };
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) return { error: "AUTH_SECRET is not configured." };
    return { error: "Sign-in failed." };
  }
  const next = String(formData.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
