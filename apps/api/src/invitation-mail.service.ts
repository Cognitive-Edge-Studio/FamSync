import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

export type MailMessage = { to: string; subject: string; text: string; idempotencyKey: string };

// Sends transactional email through Resend when RESEND_API_KEY is set, or local SMTP (Mailpit) otherwise.
@Injectable()
export class InvitationMailService {
  private readonly logger = new Logger(InvitationMailService.name);
  private readonly smtpPort = Number(process.env.INVITATION_SMTP_PORT);
  private readonly smtp = this.smtpPort
    ? nodemailer.createTransport({
        host: "127.0.0.1",
        port: this.smtpPort,
        connectionTimeout: 3_000,
        greetingTimeout: 3_000,
        socketTimeout: 7_000,
      })
    : undefined;

  // The public web origin used in links. Only HTTPS, or HTTP on a loopback host, is accepted.
  webOrigin() {
    const origin = new URL(process.env.INVITATION_WEB_ORIGIN ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.protocol !== "https:" && !(local && origin.protocol === "http:")) {
      throw new Error("Invalid web origin for email links");
    }
    return origin;
  }

  async send(to: string, familyName: string, token: string, attempt: string): Promise<"sent" | "failed"> {
    try {
      const link = new URL("/join/", this.webOrigin());
      link.hash = new URLSearchParams({ token }).toString();
      return await this.deliver({
        to, idempotencyKey: attempt,
        subject: "Your FamSync family invitation",
        text: "You’ve been invited to join " + familyName + " on FamSync.\n\n"
          + link.href + "\n\nSign in with the email address that received this invitation. The link expires in seven days.",
      });
    } catch {
      this.logger.warn("Family invitation delivery failed for attempt " + attempt);
      return "failed";
    }
  }

  // The idempotency key makes the provider drop a repeated send of the same message.
  async sendGuest(to:string,channelName:string,token:string,attempt:string):Promise<'sent'|'failed'>{
    try{const link=new URL('/join-channel/',this.webOrigin());link.hash=new URLSearchParams({token}).toString();
      return await this.deliver({to,idempotencyKey:attempt,subject:'Your FamSync channel invitation',text:'You’ve been invited to the channel '+channelName+' on FamSync.\n\n'+link.href+'\n\nSign in with the invited email. This link expires in seven days and grants access only to this channel.'});
    }catch{return 'failed';}
  }

  async deliver(message: MailMessage): Promise<"sent" | "failed"> {
    try {
      const from = process.env.INVITATION_FROM;
      if (!from) throw new Error("Missing sender address");
      const body = { from, to: message.to, subject: message.subject, text: message.text };
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error("Mail provider rejected the request");
      } else if (this.smtp) {
        const result = await this.smtp.sendMail(body);
        if (!result.accepted.length) throw new Error("SMTP recipient rejected");
      } else {
        throw new Error("Mail provider is unavailable");
      }
      return "sent";
    } catch {
      this.logger.warn("Email delivery failed for message " + message.idempotencyKey);
      return "failed";
    }
  }
}
