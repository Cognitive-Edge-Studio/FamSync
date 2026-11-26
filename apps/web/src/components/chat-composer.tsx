"use client";

import { Popover } from "@base-ui/react/popover";
import { Menu } from "@base-ui/react/menu";
import { AtSign, Check, FolderOpen, Paperclip, Send, Smile, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject, type ReactNode } from "react";
import type { ChannelDetail } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui/avatar";
import { HelperAvatar } from './ui/helper-avatar';
import { Button } from "./ui/button";
import { chatFileTypes } from "@/lib/chat-upload";
import { EmojiGrid } from "./emoji-grid";
import { floatingPanel, menuItem } from "./ui/floating";
import { showsMention } from "./message-text";
import { canRecord, VoiceButton } from "./voice-recorder";

export type Draft = { body: string; mentions: string[] };
/** A draft placed in the box from outside: the saved one, or a refused message being edited. */
export type Seed = Draft & { key: number };

type Member = ChannelDetail["members"][number];
/** The family's AI helper can be mentioned like a member. It has no account, so it adds text but no mention id. */
type Option = { kind: "member"; member: Member } | { kind: "helper"; name: string; emoji: string };

export function ChatComposer({ textarea, seed, members, helper, userId, replying, editing, attached, uploading, canAttach, onAttach, onFiles, onVoice, onChange, onSend, stickers }: {
  textarea: RefObject<HTMLTextAreaElement | null>; seed: Seed; members: ChannelDetail["members"]; userId: string;
  /** Set while the Family Helper is in this conversation. */
  helper?: { name: string; emoji: string } | null;
  replying: boolean; editing: boolean; attached: number; uploading: boolean; canAttach: boolean; onAttach: () => void; onFiles: (files: File[]) => void; onVoice: () => void;
  onChange: (draft: Draft) => void; onSend: (draft: Draft) => void;
  stickers?:ReactNode;
}) {
  const [body, setBody] = useState(seed.body), [mentions, setMentions] = useState(seed.mentions);
  const [query, setQuery] = useState<{ start: number; end: number; text: string } | null>(null), [active, setActive] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false), [voice, setVoice] = useState(false);
  useEffect(() => setVoice(canRecord()), []);
  const listId = useId(), caret = useRef<number | null>(null), picker = useRef<HTMLInputElement>(null);

  useEffect(() => { setBody(seed.body); setMentions(seed.mentions); setQuery(null); }, [seed]);
  useEffect(() => {
    if (caret.current === null) return;
    textarea.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [body, textarea]);
  // Grow with the text up to the maximum height.
  useEffect(() => {
    const box = textarea.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = box.scrollHeight + "px";
  }, [body, textarea]);

  const people = members.filter((member) => member.userId !== userId);
  const wanted = query?.text.toLowerCase() ?? "";
  const options: Option[] = query ? [
    ...(helper && helper.name.toLowerCase().includes(wanted) ? [{ kind: "helper" as const, ...helper }] : []),
    ...people.filter((member) => member.name.toLowerCase().includes(wanted)).map((member) => ({ kind: "member" as const, member })),
  ].slice(0, 6) : [];
  const selected = Math.min(active, Math.max(options.length - 1, 0));
  const ready = (!!body.trim() || attached > 0) && !uploading;

  function change(value: string, people = mentions) {
    setBody(value);
    setMentions(people);
    onChange({ body: value, mentions: people });
  }
  function findQuery(value: string, position: number) {
    const match = /(?:^|\s)@([^\s@][^@\n]{0,30})?$/.exec(value.slice(0, position));
    const text = match?.[1] ?? "";
    setQuery(match ? { start: position - text.length - 1, end: position, text } : null);
    setActive(0);
  }
  function insert(text: string) {
    const box = textarea.current, start = box?.selectionStart ?? body.length, end = box?.selectionEnd ?? start;
    const value = body.slice(0, start) + text + body.slice(end);
    if (value.length > 4000) return;
    caret.current = start + text.length;
    change(value);
    return { value, position: start + text.length };
  }
  function pick(option: Option) {
    if (!query) return;
    const text = "@" + (option.kind === "helper" ? option.name : option.member.name) + " ";
    const value = body.slice(0, query.start) + text + body.slice(query.end);
    if (value.length > 4000) return;
    caret.current = query.start + text.length;
    change(value, option.kind === "helper" || mentions.includes(option.member.userId) ? mentions : [...mentions, option.member.userId]);
    setQuery(null);
    textarea.current?.focus();
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!ready) return;
    const text = body.trim();
    onSend({ body: text, mentions: mentions.filter((id) => { const member = people.find((person) => person.userId === id); return member && showsMention(text, member.name); }) });
    setBody("");
    setMentions([]);
    setQuery(null);
    textarea.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (query && options.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((selected + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") { event.preventDefault(); pick(options[selected]); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setQuery(null); return; }
    }
    // On touch keyboards Enter adds a line, and the Send button sends.
    const touch = window.matchMedia("(hover:none) and (pointer:coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && (!touch || event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
  }

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <label htmlFor="channel-message" className="sr-only">{replying ? "Your reply" : "Message"}</label>
      <div className="relative flex items-end gap-1 rounded-xl border border-border bg-panel p-1.5 focus-within:ring-3 focus-within:ring-ring/30">
        {query && options.length > 0 && (
          <ul id={listId} role="listbox" aria-label="Mention a member" className={cn(floatingPanel, "absolute bottom-full left-0 z-20 mb-2 w-64 max-w-full")}>
            {options.map((option, index) => (
              <li key={option.kind === "helper" ? "helper" : option.member.userId} id={listId + index} role="option" aria-selected={index === selected}
                className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2 text-sm aria-selected:bg-accent"
                onMouseEnter={() => setActive(index)} onMouseDown={(event) => { event.preventDefault(); pick(option); }}>
                {option.kind === "helper" ? <>
                  <HelperAvatar emoji={option.emoji} className="size-6 rounded-full text-xs" />
                  <span className="truncate">{option.name}</span><span className="ml-auto rounded-full bg-sage px-1.5 text-[0.625rem] font-medium text-sage-foreground">AI helper</span>
                </> : <>
                  <Avatar name={option.member.name} colorKey={option.member.userId} size="sm" /><span className="truncate">{option.member.name}{option.member.guest ? " · Guest" : ""}</span>
                </>}
              </li>
            ))}
          </ul>
        )}
        {!editing && <>
          <input ref={picker} type="file" multiple hidden accept={chatFileTypes} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <Menu.Root>
            <Menu.Trigger disabled={!canAttach} render={<Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Attach files" title="Attach files" disabled={!canAttach} />}><Paperclip aria-hidden="true" /></Menu.Trigger>
            <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} className="z-50"><Menu.Popup className={cn(floatingPanel, "min-w-52")}>
              <Menu.Item className={menuItem} onClick={() => picker.current?.click()}><Upload aria-hidden="true" />Upload photos or files</Menu.Item>
              <Menu.Item className={menuItem} onClick={onAttach}><FolderOpen aria-hidden="true" />Choose a saved file</Menu.Item>
            </Menu.Popup></Menu.Positioner></Menu.Portal>
          </Menu.Root>
        </>}
        {!editing&&stickers}
        <Popover.Root open={emojiOpen} onOpenChange={setEmojiOpen}>
          <Popover.Trigger render={<Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Add emoji" title="Add emoji" />}><Smile aria-hidden="true" /></Popover.Trigger>
          <Popover.Portal><Popover.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="z-50">
            <Popover.Popup finalFocus={textarea} className={cn(floatingPanel, "w-72 p-2")}>
              <Popover.Title className="sr-only">Emoji</Popover.Title>
              <EmojiGrid label="Insert" onPick={(emoji) => { insert(emoji); setEmojiOpen(false); }} />
            </Popover.Popup>
          </Popover.Positioner></Popover.Portal>
        </Popover.Root>
        {(people.length > 0 || !!helper) && <Button type="button" variant="ghost" size="icon" className="shrink-0 max-sm:hidden" aria-label="Mention a member" title="Mention a member"
          onClick={() => {
            const position = textarea.current?.selectionStart ?? body.length;
            const added = insert(position > 0 && !/\s/.test(body[position - 1]) ? " @" : "@");
            textarea.current?.focus();
            if (added) findQuery(added.value, added.position);
          }}><AtSign aria-hidden="true" /></Button>}
        <textarea ref={textarea} id="channel-message" className="max-h-40 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-base !outline-none sm:text-sm" rows={1} maxLength={4000}
          aria-autocomplete="list" aria-controls={query && options.length ? listId : undefined} aria-activedescendant={query && options.length ? listId + selected : undefined}
          placeholder={editing ? "Edit your message…" : replying ? "Write a reply…" : "Write a message…"} value={body}
          onChange={(event) => { change(event.target.value); findQuery(event.target.value, event.target.selectionStart); }}
          onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length && !editing) { event.preventDefault(); onFiles(files); } }}
          onKeyDown={keyDown} onBlur={() => setQuery(null)} />
        {voice && !editing && !uploading && !body.trim() && attached === 0 ? <VoiceButton onClick={onVoice} /> :
        <Button type="submit" size="icon" className="shrink-0" aria-label={editing ? "Save edit" : "Send message"} title={uploading ? "Files are still uploading" : editing ? "Save edit" : "Send message"} disabled={!ready}>{editing ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}</Button>}
      </div>
      <p className="text-xs text-muted-foreground">{body.length > 3600 ? body.length + "/4000" : <span className="[@media(hover:none)]:hidden">Enter sends, Shift+Enter adds a line</span>}</p>
    </form>
  );
}
