export class AppError extends Error {
  constructor(
    message: string,
    readonly code: "bad_request" | "forbidden" | "not_found" | "conflict" = "bad_request",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string };

export function actionError(error: unknown): ActionResult<never> {
  if (error instanceof AppError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: "The action could not be completed." };
}
