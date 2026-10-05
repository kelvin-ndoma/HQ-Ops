import { AppError } from "./errors";

/** Plug in Turnstile or another verifier later. Until one is configured, submissions are not challenged. */
export type CaptchaVerifier = (token: string | undefined, ip: string) => Promise<boolean>;

let verifier: CaptchaVerifier | null = null;

export function configureCaptcha(next: CaptchaVerifier | null) {
  verifier = next;
}

export async function verifyCaptcha(token: string | undefined, ip: string) {
  if (!verifier) return;
  const passed = await verifier(token, ip);
  if (!passed) throw new AppError("We could not confirm this submission. Please try again.");
}
