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

export async function deliverProposal(input: { to: string; subject: string; text: string; url: string }) {
  if (!process.env.EMAIL_PROVIDER) {
    if (process.env.NODE_ENV === "production") return "skipped" as const;
    console.info(`HQ development proposal for ${input.to}: ${input.url}`);
    return "development" as const;
  }
  const result = await configuredProvider.send({ to: input.to, subject: input.subject, text: input.text });
  return result === "sent" ? ("provider" as const) : ("skipped" as const);
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
