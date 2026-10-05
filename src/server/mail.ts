export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
};

export interface MailProvider {
  id: string;
  send(message: OutboundMail): Promise<"sent" | "skipped">;
}

/** Replace this provider when a transactional email service is configured. */
const configuredProvider: MailProvider = {
  id: process.env.EMAIL_PROVIDER || "unconfigured",
  async send() {
    if (!process.env.EMAIL_PROVIDER) return "skipped";
    return "skipped";
  },
};

export function invitationLinksAreVisible() {
  return process.env.NODE_ENV !== "production";
}

export async function deliverInvitation(input: { to: string; name: string; url: string }) {
  if (process.env.NODE_ENV === "production") {
    await configuredProvider.send({
      to: input.to,
      subject: "You are invited to HQ Operations",
      text: `${input.name}, set your HQ Operations password: ${input.url}`,
    });
    return "provider" as const;
  }
  console.info(`HQ development invitation for ${input.to}: ${input.url}`);
  return "development" as const;
}
