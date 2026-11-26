"use client";

import type { Session } from "@supabase/auth-js";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { AlertCircle, Ban, Check, CheckCheck, Clock, Info, Copy, Ellipsis, Forward, Link2, Pencil, Pin, PinOff, Reply, SmilePlus, Star, StarOff, Trash2 } from "lucide-react";
import { Fragment, memo, useState } from "react";
import { attachmentLabel, channelReactions, type ChannelDetail, type ChannelMessage } from "@/lib/channels";
import type { Outgoing } from "@/lib/chat-drafts";
import { cn } from "@/lib/utils";
import { MessageFiles } from "./conversation-files";
import { MessageText, showsMention } from "./message-text";
import { MessageWorkTools } from "./message-work-tools";
import { Avatar } from "./ui/avatar";
import { HelperAvatar } from './ui/helper-avatar';
import { EmojiGrid } from "./emoji-grid";
import { Button } from "./ui/button";
import { floatingPanel, menuItem } from "./ui/floating";

const dayKey = (value: string) => new Date(value).toDateString();
const clock = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
export function dayLabel(value: string) {
  const day = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return "Today";
  if (day.toDateString() === yesterday.toDateString()) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", ...(day.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
}
const bubble = (mine: boolean) => cn("min-w-0 rounded-2xl px-3.5 py-2.5", mine ? "rounded-tr-md bg-primary text-primary-foreground" : "rounded-tl-md bg-muted");
const quote = (mine: boolean) => cn("mb-2 block w-full border-l-2 pl-2.5 text-left text-xs", mine ? "border-primary-foreground/40 text-primary-foreground" : "border-border text-muted-foreground");

export type FeedActions = {
  react: (message: ChannelMessage, emoji: string) => void;
  reply: (message: ChannelMessage) => void;
  copy: (message: ChannelMessage) => void;
  jump: (id: string) => void;
  toggleTools: (id: string) => void;
  forward: (message: ChannelMessage) => void;
  star: (message: ChannelMessage) => void;
  pin: (message: ChannelMessage) => void;
  info: (message: ChannelMessage) => void;
  editMessage: (message: ChannelMessage) => void;
  remove: (message: ChannelMessage) => void;
  changed: () => void;
  retry: (id: string) => void;
  discard: (id: string) => void;
  edit: (id: string) => void;
};

type RowProps = {
  session: Session; familyId: string; channel: ChannelDetail; message: ChannelMessage; grouped: boolean; guestAuthor: boolean;
  busy: boolean; tools: boolean; highlighted: boolean; receipt: Receipt; actions: FeedActions;
};

export const replyText = (reply: { body: string; deleted: boolean; fileCount: number; attachment: Parameters<typeof attachmentLabel>[0] }) => reply.deleted ? "Message deleted" : reply.body || (reply.fileCount ? attachmentLabel(reply.attachment, reply.fileCount) : "Attachment removed");
const before = (until: string | null) => !!until && Date.now() < Date.parse(until);

export type Receipt = "sent" | "delivered" | "read" | null;
/** People who were in the conversation when the message was sent, other than its author. */
export const receiptPeople = (channel: ChannelDetail, message: ChannelMessage) =>
  channel.members.filter((member) => member.userId !== message.author?.userId && member.joinedPosition < message.position);
function receiptOf(channel: ChannelDetail, message: ChannelMessage): Receipt {
  const people = receiptPeople(channel, message);
  if (!people.length) return null;
  if (people.every((member) => (member.readPosition ?? 0) >= message.position)) return "read";
  return people.every((member) => member.deliveredPosition >= message.position) ? "delivered" : "sent";
}
const receiptLabels = { sent: "Sent", delivered: "Delivered", read: "Read" };

// Opening the menu decides which time-limited actions still apply; the server has the final say.
function MessageMenu({ mine, channel, message, tools, actions }: { mine: boolean; channel: ChannelDetail; message: ChannelMessage; tools: boolean; actions: FeedActions }) {
  const canEdit = before(message.editableUntil) && !channel.archived, canDelete = before(message.deletableUntil);
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button variant="ghost" size="icon" className="size-7" aria-label={"More actions for message " + message.position} title="More actions" />}><Ellipsis aria-hidden="true" /></Menu.Trigger>
      <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} collisionPadding={12} className="z-50"><Menu.Popup className={cn(floatingPanel, "min-w-44")}>
        <Menu.Item className={menuItem} onClick={() => actions.forward(message)}><Forward aria-hidden="true" />Forward</Menu.Item>
        <Menu.Item className={menuItem} onClick={() => actions.star(message)}>{message.starred ? <StarOff aria-hidden="true" /> : <Star aria-hidden="true" />}{message.starred ? "Remove star" : "Star"}</Menu.Item>
        {channel.canCreateWork && !channel.archived && <Menu.Item className={menuItem} onClick={() => actions.pin(message)}>{message.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{message.pinned ? "Unpin" : "Pin for everyone"}</Menu.Item>}
        {(channel.canCreateWork || message.files.length < 5) && !channel.archived && <Menu.Item className={menuItem} onClick={() => actions.toggleTools(message.id)}><Link2 aria-hidden="true" />{tools ? "Hide linking" : "Link or attach"}</Menu.Item>}
        {mine && <Menu.Item className={menuItem} onClick={() => actions.info(message)}><Info aria-hidden="true" />Message info</Menu.Item>}
        {canEdit && <Menu.Item className={menuItem} onClick={() => actions.editMessage(message)}><Pencil aria-hidden="true" />Edit</Menu.Item>}
        {canDelete && <Menu.Item className={cn(menuItem, "text-destructive")} onClick={() => actions.remove(message)}><Trash2 aria-hidden="true" />Delete for everyone</Menu.Item>}
      </Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>
  );
}

const MessageRow = memo(function MessageRow({ session, familyId, channel, message, grouped, guestAuthor, busy, tools, highlighted, receipt, actions }: RowProps) {
  const mine = !message.fromHelper && message.author?.userId === session.user.id;
  const author = message.fromHelper ? channel.helper?.name ?? "Family Helper" : message.author?.name ?? "Former member";
  const [picking, setPicking] = useState(false);
  // The helper's reply mentions the member who asked, so that mention is shown as a chip only when it isn't in the text.
  const hidden = message.fromHelper ? [] : message.mentions.filter((person) => !showsMention(message.body, person.name));
  return (
    <li id={"message-" + message.id} data-message-id={message.id} tabIndex={-1}
      className={cn("group/message flex min-w-0 gap-2.5 rounded-xl outline-none transition-colors duration-500", mine && "flex-row-reverse", grouped ? "mt-1" : "mt-4", highlighted && "bg-lavender/60")}>
      {!mine && (grouped ? <span className="w-8 shrink-0" aria-hidden="true" />
        : message.fromHelper ? <HelperAvatar emoji={channel.helper?.emoji} className="mt-5 size-8 rounded-full text-base" />
        : <Avatar name={author} colorKey={message.author?.userId} className="mt-5" />)}
      <div className={cn("relative grid min-w-0 max-w-[min(36rem,85%)] gap-1", mine ? "justify-items-end" : "justify-items-start")}>
        <div className={cn("flex flex-wrap items-baseline gap-x-2 text-xs", mine && "flex-row-reverse", grouped && "sr-only")}>
          <span className="font-medium wrap-anywhere">{mine ? "You" : author}{guestAuthor ? " · Guest" : ""}</span>
          {message.fromHelper && <span className="rounded-full bg-sage px-1.5 py-px text-[0.625rem] font-medium text-sage-foreground">AI helper</span>}
          <time dateTime={message.createdAt} className="text-muted-foreground">{clock(message.createdAt)}</time>
        </div>
        {message.deleted ? <p className="flex items-center gap-1.5 rounded-2xl border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground italic"><Ban aria-hidden="true" className="size-3.5 shrink-0" />{mine ? "You deleted this message" : "This message was deleted"}</p>
        : <>
        {(message.body || message.replyTo || message.forwarded || !message.files.length) && <div className={bubble(mine)} title={new Date(message.createdAt).toLocaleString()}>
          {message.forwarded && <p className="mb-1 flex items-center gap-1 text-xs italic opacity-80"><Forward aria-hidden="true" className="size-3" />Forwarded</p>}
          {message.replyTo && (
            <button type="button" className={quote(mine)} onClick={() => actions.jump(message.replyTo!.id)} aria-label={"Show the original message from " + (message.replyTo.author?.name ?? "Former member")}>
              <span className="font-semibold">{message.replyTo.fromHelper ? channel.helper?.name ?? "Family Helper" : message.replyTo.author?.userId === session.user.id ? "You" : message.replyTo.author?.name ?? "Former member"}</span>
              <span className="mt-0.5 line-clamp-3 wrap-anywhere whitespace-pre-wrap">{replyText(message.replyTo)}</span>
            </button>
          )}
          {!message.body && !message.files.length && <p className="text-sm italic opacity-80">Attachment removed</p>}
          {message.body && <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap"><MessageText body={message.body} mentions={message.mentions.map((person) => person.name)} /></p>}
          {hidden.length > 0 && <p className={cn("mt-1.5 text-xs wrap-anywhere", mine ? "text-primary-foreground" : "text-lavender-foreground")}>Mentions: {hidden.map((person) => "@" + person.name).join(", ")}</p>}
        </div>}
        {(message.editedAt || message.starred || message.pinned || receipt) && <p className="order-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {message.editedAt && <span title={new Date(message.editedAt).toLocaleString()}>edited</span>}
          {message.starred && <Star role="img" aria-label="Starred by you" className="size-3 fill-current" />}
          {message.pinned && <Pin role="img" aria-label="Pinned" className="size-3" />}
          {receipt && (receipt === "sent" ? <Check role="img" aria-label="Sent" className="size-3.5" /> : <CheckCheck role="img" aria-label={receiptLabels[receipt]} className={cn("size-3.5", receipt === "read" && "text-sky-600 dark:text-sky-400")} />)}</p>}
        {message.reactions.length > 0 && <div className={cn("order-2 flex flex-wrap gap-1", mine && "justify-end")}>
          {message.reactions.map((reaction) => (
            <Popover.Root key={reaction.emoji}>
              <Popover.Trigger aria-label={reaction.emoji + " " + reaction.count + ", show who reacted"} title={reaction.people.map((person) => person.name).join(", ")}
                className={cn("inline-flex h-6 items-center gap-1 rounded-full border border-border px-2 text-xs hover:bg-accent", reaction.active ? "bg-lavender text-lavender-foreground" : "bg-panel")}>{reaction.emoji}<span className="tabular-nums">{reaction.count}</span></Popover.Trigger>
              <Popover.Portal><Popover.Positioner side="top" sideOffset={6} collisionPadding={12} className="z-50"><Popover.Popup className={cn(floatingPanel, "grid w-52 gap-1 p-2")}>
                <Popover.Title className="px-1 text-xs font-medium text-muted-foreground">Reacted {reaction.emoji}</Popover.Title>
                <ul className="max-h-40 overflow-y-auto">{reaction.people.map((person) => <li key={person.userId} className="flex items-center gap-2 px-1 py-1 text-sm"><Avatar name={person.name} colorKey={person.userId} size="sm" /><span className="truncate">{person.userId === session.user.id ? "You" : person.name}</span></li>)}</ul>
                {!channel.archived && <Popover.Close render={<Button variant="outline" className="h-8 text-xs" disabled={busy} />} onClick={() => actions.react(message, reaction.emoji)}>{reaction.active ? "Remove yours" : "React " + reaction.emoji}</Popover.Close>}
              </Popover.Popup></Popover.Positioner></Popover.Portal>
            </Popover.Root>
          ))}
        </div>}
        {/* A floating toolbar with a mouse or keyboard; on touch screens, a row under the tapped message. */}
        <div role="group" aria-label={"Actions for message " + message.position}
          className={cn("order-3 flex flex-wrap items-center gap-0.5 [@media(hover:none)]:gap-0 [@media(hover:none)]:max-h-0 [@media(hover:none)]:overflow-hidden [@media(hover:none)]:opacity-0 [@media(hover:none)]:group-focus-within/message:max-h-20 [@media(hover:none)]:group-focus-within/message:opacity-100", mine && "justify-end",
            "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:absolute [@media(hover:hover)]:-top-5 [@media(hover:hover)]:z-10 [@media(hover:hover)]:w-max [@media(hover:hover)]:flex-nowrap [@media(hover:hover)]:rounded-full [@media(hover:hover)]:border [@media(hover:hover)]:border-border [@media(hover:hover)]:bg-panel [@media(hover:hover)]:px-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:shadow-sm",
            "has-[[data-popup-open]]:pointer-events-auto has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:has-[[data-popup-open]]:max-h-20 [@media(hover:none)]:has-[[data-popup-open]]:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100", tools && "pointer-events-auto opacity-100", mine ? "[@media(hover:hover)]:right-0" : "[@media(hover:hover)]:left-0")}>
          {channelReactions.map((emoji) => <Button key={emoji} variant="ghost" className="h-7 rounded-full px-1.5 text-sm [@media(hover:none)]:px-1" aria-label={"React " + emoji + " to message " + message.position}
            aria-pressed={message.reactions.find((item) => item.emoji === emoji)?.active ?? false} disabled={busy || channel.archived} onClick={() => actions.react(message, emoji)}>{emoji}</Button>)}
          <Popover.Root open={picking} onOpenChange={setPicking}>
            <Popover.Trigger render={<Button variant="ghost" size="icon" className="size-7" aria-label={"Choose a reaction for message " + message.position} title="Other reaction" disabled={busy || channel.archived} />}><SmilePlus aria-hidden="true" /></Popover.Trigger>
            <Popover.Portal><Popover.Positioner side="top" sideOffset={6} collisionPadding={12} className="z-50"><Popover.Popup className={cn(floatingPanel, "w-72 p-2")}>
              <Popover.Title className="sr-only">Choose a reaction</Popover.Title>
              <EmojiGrid label="React" onPick={(emoji) => { setPicking(false); actions.react(message, emoji); }} />
            </Popover.Popup></Popover.Positioner></Popover.Portal>
          </Popover.Root>
          <Button variant="ghost" size="icon" className="size-7" aria-label={"Reply to message " + message.position} title="Reply" disabled={channel.archived} onClick={() => actions.reply(message)}><Reply aria-hidden="true" /></Button>
          {message.body && <Button variant="ghost" size="icon" className="size-7" aria-label={"Copy message " + message.position} title="Copy text" onClick={() => actions.copy(message)}><Copy aria-hidden="true" /></Button>}
          <MessageMenu mine={mine} channel={channel} message={message} tools={tools} actions={actions} />
        </div>
        <div className={cn("grid w-full min-w-0 gap-1 empty:hidden", mine && "justify-items-end")}>
          <MessageWorkTools actions={tools} session={session} familyId={familyId} channel={channel} message={message} onChanged={actions.changed} />
          <MessageFiles showAttach={tools} session={session} familyId={familyId} channel={channel} message={message} onChanged={actions.changed} />
        </div>
        </>}
      </div>
    </li>
  );
});

function Divider({ children, strong = false, id }: { children: string; strong?: boolean; id?: string }) {
  return (
    <li id={id} className="mt-4 flex items-center gap-3 text-xs">
      <span aria-hidden="true" className={cn("h-px flex-1", strong ? "bg-primary" : "bg-border")} />
      <span className={strong ? "font-semibold" : "font-medium text-muted-foreground"}>{children}</span>
      <span aria-hidden="true" className={cn("h-px flex-1", strong ? "bg-primary" : "bg-border")} />
    </li>
  );
}

export const unreadDividerId = "unread-messages";

export function ChatFeed({ session, familyId, channel, messages, outgoing, unreadAfter, busy, toolsFor, highlighted, guestIds, actions }: {
  session: Session; familyId: string; channel: ChannelDetail; messages: ChannelMessage[]; outgoing: Outgoing[]; unreadAfter: number | null;
  busy: boolean; toolsFor: string | null; highlighted: string | null; guestIds: Set<string>; actions: FeedActions;
}) {
  const me = session.user.id;
  const firstUnread = unreadAfter === null ? undefined : messages.find((message) => message.position > unreadAfter && message.author?.userId !== me)?.id;
  return (
    <ol aria-label="Conversation messages">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt), unread = message.id === firstUnread;
        const grouped = !newDay && !unread && !!previous.author && previous.author.userId === message.author?.userId
          && Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 5 * 60_000;
        return (
          <Fragment key={message.id}>
            {newDay && <Divider>{dayLabel(message.createdAt)}</Divider>}
            {unread && <Divider strong id={unreadDividerId}>Unread messages</Divider>}
            <MessageRow session={session} familyId={familyId} channel={channel} message={message} grouped={grouped} guestAuthor={!!message.author && guestIds.has(message.author.userId)}
              busy={busy} tools={toolsFor === message.id} highlighted={highlighted === message.id} receipt={message.author?.userId === me && !message.deleted ? receiptOf(channel, message) : null} actions={actions} />
          </Fragment>
        );
      })}
      {outgoing.map((item) => (
        <li key={item.id} data-outgoing={item.state} className="mt-4 flex min-w-0 flex-row-reverse">
          <div className="grid min-w-0 max-w-[min(36rem,85%)] justify-items-end gap-1">
            <div className={cn(bubble(true), item.state === "sending" && "opacity-70")}>
              {item.reply && <div className={quote(true)}><span className="font-semibold">{item.reply.author}</span><span className="mt-0.5 line-clamp-3 wrap-anywhere whitespace-pre-wrap">{item.reply.body}</span></div>}
              {item.body && <p className="text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap"><MessageText body={item.body} mentions={channel.members.filter((member) => item.mentions.includes(member.userId)).map((member) => member.name)} /></p>}
              {item.files.length > 0 && <p className="mt-1 text-xs wrap-anywhere">{item.files.map((file) => file.fileName).join(", ")}</p>}
            </div>
            {item.state === "sending"
              ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock aria-hidden="true" className="size-3" />Sending…</p>
              : <div role="alert" className="grid justify-items-end gap-1">
                  <p className="flex items-center gap-1 text-xs text-destructive"><AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />{item.error ?? "Not sent."}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => actions.retry(item.id)}>Retry</Button>
                    {item.refused && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => actions.edit(item.id)}>Edit</Button>}
                    <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => actions.discard(item.id)}>Discard</Button>
                  </div>
                </div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
