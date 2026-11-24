import { messageParts } from "@famsync/core/chat";

export { showsMention } from "@famsync/core/chat";

/** Plain text with web links and the message's own mentions highlighted. Nothing is interpreted as HTML. */
export function MessageText({ body, mentions }: { body: string; mentions: string[] }) {
  return <>{messageParts(body, mentions).map((part, index) => part.kind === "link"
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 wrap-anywhere">{part.text}</a>
    : part.kind === "mention" ? <span key={index} className="font-semibold">{part.text}</span> : part.text)}</>;
}
