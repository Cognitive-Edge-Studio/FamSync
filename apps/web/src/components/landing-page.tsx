"use client";
import { ModuleIcon } from "./ui/module-icon";
import { Avatar } from "./ui/avatar";


import { ArrowRight, ArrowUpRight, Bell, CalendarDays, Check, FileText, Folder, House, Image as ImageIcon, Lock, Menu, MessageCircle, Plus, Target, Users, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ease, MotionProvider } from "./ui/motion";
import { ButtonLink } from "./ui/button";
import { ThemeMenu } from "./theme-menu";

// Public landing page. Style follows a soft, editorial look: warm stone canvas, large bold headings,
// rounded white panels, numbered steps and small illustrative product cards. Every card shows
// behaviour FamSync really has; nothing here is a placeholder for a feature that does not exist.

const nav = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#privacy", label: "Privacy" },
  { href: "#faq", label: "FAQ" },
];

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Content is visible in the exported HTML, so the page reads without JavaScript and before it loads. After the
// page hydrates, anything still below the fold is hidden before paint and fades in once it scrolls into view.
function useBelowFold<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [below, setBelow] = useState(false);
  useIsoLayoutEffect(() => {
    const element = ref.current;
    if (element && element.getBoundingClientRect().top > window.innerHeight) setBelow(true);
  }, []);
  return [ref, below] as const;
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, below] = useBelowFold<HTMLDivElement>();
  return (
    <motion.div ref={ref} key={below ? "reveal" : "static"} className={"min-w-0 " + (className ?? "")} initial={below ? { opacity: 0, y: 18 } : false}
      whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.55, ease, delay }}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{children}</p>;
}

function Heading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={"mt-3 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.04] font-bold tracking-[-0.035em] text-balance " + className}>{children}</h2>;
}

function Steps({ items }: { items: { title: string; text?: string }[] }) {
  return (
    <ol className="mt-8 grid gap-5">
      {items.map((item, i) => (
        <li key={item.title} className="flex gap-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <div className="pt-1.5">
            <p className="font-semibold">{item.title}</p>
            {item.text && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

// Small illustrative product card wrapper, labelled so nobody mistakes it for live data.
function Demo({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <figure className={"rounded-3xl border border-border bg-panel p-4 shadow-[0_18px_50px_-30px_rgba(36,36,36,0.35)] sm:p-5 " + className}>
      {children}
      <figcaption className="mt-4 text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

const tint = {
  sage: "bg-sage text-sage-foreground", peach: "bg-peach text-peach-foreground", lavender: "bg-lavender text-lavender-foreground",
  sky: "bg-sky text-sky-foreground", rose: "bg-rose text-rose-foreground",
};

function Pill({ tone, children }: { tone: keyof typeof tint; children: ReactNode }) {
  return <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " + tint[tone]}>{children}</span>;
}

function CalendarDemo() {
  const rows = [
    { time: "10:00", title: "Grandma’s ride to physical therapy", who: "Selected members", tone: "lavender" as const },
    { time: "15:45", title: "Lily — orthodontist check", who: "Family", tone: "sky" as const },
    { time: "17:30", title: "Sunday dinner at Grandma’s", who: "Repeats weekly", tone: "peach" as const },
  ];
  return (
    <Demo label="Illustrative example · times show in your family’s time zone">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Today</p><Pill tone="sage">3 events</Pill></div>
      <ul className="mt-3 grid gap-2">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <span className={"grid size-9 shrink-0 place-items-center rounded-xl " + tint[r.tone]}><ModuleIcon name="calendar" className="size-4" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.time} · {r.who}</p></div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs"><ModuleIcon name="notifications" className="mt-0.5 size-3.5 shrink-0" />
        <p><span className="font-semibold">Moved:</span> Lily’s piano lesson is now Sunday at 4:00 PM. The linked task moved with it.</p></div>
    </Demo>
  );
}

function TasksDemo() {
  const [done, setDone] = useState<Record<string, boolean>>({ cabin: true });
  const tasks = [
    { id: "bag", title: "Pack soccer bag", who: "Jake", due: "Tue 3:30 PM", tone: "sky" as const },
    { id: "slip", title: "Sign science fair permission slip", who: "Emily", due: "Tomorrow", tone: "peach" as const },
    { id: "plants", title: "Water the patio plants", who: "Lily", due: "Every 2 days", tone: "sage" as const },
    { id: "cabin", title: "Book the ski cabin", who: "Emily", due: "Done", tone: "lavender" as const },
  ];
  return (
    <Demo label="Try it · tick a task. Nothing is saved.">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">Tasks and chores</p>
        <span className="text-xs text-muted-foreground">{Object.values(done).filter(Boolean).length} of {tasks.length} done</span></div>
      <ul className="mt-3 grid gap-2">
        {tasks.map((t) => {
          const checked = !!done[t.id];
          return (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/60">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => setDone((d) => ({ ...d, [t.id]: !checked }))} />
                <motion.span animate={{ scale: checked ? [1, 1.18, 1] : 1 }} transition={{ duration: 0.3 }}
                  className={"grid size-6 shrink-0 place-items-center rounded-full border peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 " + (checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-panel")}>
                  {checked && <Check className="size-3.5" aria-hidden="true" />}
                </motion.span>
                <div className="min-w-0 grow"><p className={"truncate text-sm font-medium transition-colors " + (checked ? "text-muted-foreground line-through" : "")}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.due}</p></div>
                <Pill tone={t.tone}>{t.who}</Pill>
              </label>
            </li>
          );
        })}
      </ul>
    </Demo>
  );
}

function GoalsDemo() {
  const [listRef, below] = useBelowFold<HTMLUListElement>();
  const goals = [
    { title: "Ski trip ready", meta: "Checklist · 2 of 5 steps", value: 40, tone: "bg-sage-foreground" },
    { title: "Read 12 books this year", meta: "Jake · 9 of 12 books", value: 75, tone: "bg-sky-foreground" },
    { title: "Save for a new refrigerator", meta: "Family · $1,350 of $2,400", value: 56, tone: "bg-peach-foreground" },
  ];
  return (
    <Demo label="Illustrative example · linked tasks fill checklist goals automatically">
      <p className="text-sm font-semibold">Goal progress</p>
      <ul ref={listRef} className="mt-3 grid gap-3">
        {goals.map((g, i) => (
          <li key={g.title} className="rounded-2xl border border-border p-3">
            <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-medium">{g.title}</p><p className="text-xs font-semibold tabular-nums">{g.value}%</p></div>
            <p className="text-xs text-muted-foreground">{g.meta}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <motion.div key={below ? "grow" : "static"} className={"h-full rounded-full " + g.tone} style={{ width: g.value + "%" }} initial={below ? { width: 0 } : false} whileInView={{ width: g.value + "%" }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.12 }} />
            </div>
          </li>
        ))}
      </ul>
    </Demo>
  );
}

function ChatDemo() {
  const [asTask, setAsTask] = useState(false);
  return (
    <Demo label="Try it · turn a message into a task. Nothing is saved.">
      <div className="flex items-center gap-2"><span className="text-lg" aria-hidden="true">🏠</span><p className="text-sm font-semibold">Household</p><span className="text-xs text-muted-foreground">· 5 members</span></div>
      <div className="mt-3 grid gap-2.5">
        <div className="max-w-[85%]"><p className="text-xs text-muted-foreground">Michael</p><p className="mt-1 rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm">Plumber fixed the water heater. Receipt is on the fridge.</p></div>
        <div className="max-w-[85%]"><p className="text-xs text-muted-foreground">Grandma</p><p className="mt-1 rounded-2xl rounded-tl-md bg-muted px-3.5 py-2.5 text-sm">The kitchen faucet is dripping again, by the way.</p></div>
        <div className="ml-auto max-w-[85%] text-right"><p className="text-xs text-muted-foreground">Emily</p>
          <p className="mt-1 rounded-2xl rounded-tr-md bg-lavender px-3.5 py-2.5 text-left text-sm text-lavender-foreground"><span className="font-semibold">@Michael</span> can you ask him to come back this week?</p></div>
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <AnimatePresence mode="wait" initial={false}>
          {asTask ? (
            <motion.div key="task" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex items-center gap-3 rounded-2xl bg-sage p-3 text-sage-foreground">
              <Check className="size-4 shrink-0" aria-hidden="true" /><p className="grow text-sm"><span className="font-semibold">Task created:</span> Fix the kitchen faucet · Michael</p>
              <button type="button" className="text-xs font-medium underline" onClick={() => setAsTask(false)}>Reset</button>
            </motion.div>
          ) : (
            <motion.button key="btn" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAsTask(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-medium hover:bg-muted">
              <Plus className="size-4" aria-hidden="true" /> Create task from message
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </Demo>
  );
}

function FilesDemo() {
  const folders = [
    { name: "Medical records", who: "Emily and Grandma", icon: Lock, tone: "rose" as const, files: 3 },
    { name: "School documents", who: "Everyone", icon: Folder, tone: "sky" as const, files: 8 },
    { name: "Ski trip", who: "Ski trip channel", icon: MessageCircle, tone: "sage" as const, files: 5 },
  ];
  return (
    <Demo label="Illustrative example · files inherit their folder’s audience">
      <p className="text-sm font-semibold">Folders</p>
      <ul className="mt-3 grid gap-2">
        {folders.map((f) => (
          <li key={f.name} className="flex items-center gap-3 rounded-2xl border border-border p-3">
            <span className={"grid size-9 shrink-0 place-items-center rounded-xl " + tint[f.tone]}><f.icon className="size-4" aria-hidden="true" /></span>
            <div className="min-w-0 grow"><p className="truncate text-sm font-medium">{f.name}</p><p className="text-xs text-muted-foreground">{f.who} · {f.files} files</p></div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><FileText className="size-3.5" aria-hidden="true" />Itinerary.txt</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><ImageIcon className="size-3.5" aria-hidden="true" />last-winter.jpg</span>
      </div>
    </Demo>
  );
}

const audiences = [
  { id: "private", label: "Only me", who: ["Emily"] },
  { id: "selected", label: "Selected", who: ["Emily", "Michael"] },
  { id: "family", label: "Everyone", who: ["Emily", "Michael", "Jake", "Lily", "Grandma"] },
] as const;
const people = ["Emily", "Michael", "Jake", "Lily", "Grandma"];

function PrivacyDemo() {
  const [audience, setAudience] = useState<(typeof audiences)[number]["id"]>("selected");
  const current = audiences.find((a) => a.id === audience)!;
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = audiences.findIndex((a) => a.id === audience);
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: audiences.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + audiences.length) % audiences.length;
    setAudience(audiences[target].id);
    radios.current[target]?.focus();
  }
  return (
    <Demo label="Try it · choose who can see this event. Nothing is saved.">
      <p className="text-sm font-semibold">Anniversary dinner</p>
      <p className="text-xs text-muted-foreground">Saturday · 7:30 PM</p>
      <div role="radiogroup" aria-label="Who can see this?" onKeyDown={onKeyDown} className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {audiences.map((a, i) => (
          <button key={a.id} ref={(node) => { radios.current[i] = node; }} type="button" role="radio" aria-checked={audience === a.id}
            tabIndex={audience === a.id ? 0 : -1} onClick={() => setAudience(a.id)}
            className="relative h-8 rounded-full text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {audience === a.id && <motion.span layoutId="audience-pill" className="absolute inset-0 rounded-full bg-panel shadow-sm" transition={{ duration: 0.3, ease }} />}
            <span className="relative">{a.label}</span>
          </button>
        ))}
      </div>
      <ul className="mt-4 grid gap-2" aria-label="Who can see it">
        {people.map((p) => {
          const sees = (current.who as readonly string[]).includes(p);
          return (
            <motion.li key={p} layout className="flex items-center gap-3 text-sm" animate={{ opacity: sees ? 1 : 0.4 }}>
              <Avatar name={p} colorKey={"landing-" + p} />
              <span className="grow">{p}</span>
              <span className="text-xs text-muted-foreground">{sees ? "Can see it" : "Hidden"}</span>
            </motion.li>
          );
        })}
      </ul>
    </Demo>
  );
}

const faqs = [
  { q: "Who can see what I add?", a: "You choose on every event, task, goal and folder: only you, selected family members, or everyone in the family. Conversation folders follow whoever is in that channel or direct message." },
  { q: "How do family members join?", a: "The family owner sends an email invitation. It works for seven days and only for the account that received it. Resending replaces the earlier link." },
  { q: "Can someone outside the family join a conversation?", a: "If the owner allows guests, a channel manager can invite someone to one channel. Guests see only that channel and its files — no family calendar, tasks or directory." },
  { q: "Will we get reminders?", a: "Yes. Events, tasks and chores can remind you in the app and by email. Quiet hours hold reminder emails until they end, and an email that would arrive more than two hours late is skipped — the reminder still shows in the app." },
  { q: "What files can we store?", a: "PDF, JPEG, PNG, WebP, TXT and CSV up to 5 MB each. Images and text preview in the app, and every download link expires within a minute." },
  { q: "Do repeating chores work across time zones?", a: "Each family has its own time zone, so “every Saturday at 9” stays Saturday at 9 at home, wherever the person adding it happens to be." },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-border border-y border-border">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        return (
          <li key={f.q}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={"faq-" + i} onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-lg">
                {f.q}
                <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.25, ease }} className="grid size-8 shrink-0 place-items-center rounded-full bg-muted"><Plus className="size-4" aria-hidden="true" /></motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div id={"faq-" + i} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
                  <p className="max-w-2xl pb-5 leading-relaxed text-muted-foreground">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function Feature({ id, eyebrow, title, text, points, demo, flip = false }: { id?: string; eyebrow: string; title: ReactNode; text: string; points: string[]; demo: ReactNode; flip?: boolean }) {
  return (
    <section id={id} className="scroll-mt-24 py-14 sm:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal className={flip ? "lg:order-2" : undefined}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading>{title}</Heading>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">{text}</p>
          <ul className="mt-6 grid gap-2.5">
            {points.map((p) => <li key={p} className="flex gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-sage-foreground" aria-hidden="true" />{p}</li>)}
          </ul>
        </Reveal>
        <Reveal delay={0.1} className={"mx-auto w-full max-w-md " + (flip ? "lg:order-1" : "")}>{demo}</Reveal>
      </div>
    </section>
  );
}

export function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  useEffect(() => {
    try { setSignedIn(!!JSON.parse(localStorage.getItem("famsync-session") ?? "null")?.access_token); } catch { setSignedIn(false); }
  }, []);
  const primary = signedIn ? { href: "/today/", label: "Open Today" } : { href: "/sign-up/", label: "Get started" };

  return (
    <MotionProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-4 focus:py-2">Skip to content</a>
      <div className="min-h-svh bg-canvas text-foreground">
        <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <a href="/" className="inline-flex items-center gap-2.5 rounded-lg text-lg font-bold tracking-tight">
              <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground"><ModuleIcon name="home" className="size-4" /></span>FamSync
            </a>
            <nav aria-label="Page sections" className="hidden items-center gap-1 md:flex">
              {nav.map((n) => <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-muted hover:text-foreground">{n.label}</a>)}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ThemeMenu className="rounded-full" />
              {!signedIn && <a href="/sign-in/" className="hidden rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted sm:inline-flex">Sign in</a>}
              <ButtonLink href={primary.href} className="h-10 rounded-full px-5">{primary.label}</ButtonLink>
              <button ref={menuButton} type="button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="landing-menu" onClick={() => setMenu((m) => !m)}
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted md:hidden">{menu ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}</button>
            </div>
          </div>
          <AnimatePresence>
            {menu && (
              <motion.nav id="landing-menu" aria-label="Page sections" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden border-b border-border md:hidden">
                <div className="grid gap-1 px-4 pb-4">
                  {nav.map((n) => <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">{n.label}</a>)}
                  {!signedIn && <a href="/sign-in/" className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">Sign in</a>}
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 outline-none sm:px-6">
          {/* Hero */}
          <section className="pt-4 pb-14 sm:pb-20">
            <motion.div initial={{ scale: 0.985 }} animate={{ scale: 1 }} transition={{ duration: 0.8, ease }} className="overflow-hidden rounded-[2rem] bg-accent">
              <img data-dim src="/landing/hero-1600.webp" srcSet="/landing/hero-900.webp 900w, /landing/hero-1600.webp 1600w" sizes="(min-width: 1152px) 1104px, 100vw"
                width={1600} height={893} alt="A family planning their week together around a big calendar and checklist, with two plush companions" className="h-auto w-full" fetchPriority="high" />
            </motion.div>
            <div className="mx-auto mt-10 max-w-3xl text-center">
              <motion.h1 initial={{ y: 16 }} animate={{ y: 0 }} transition={{ duration: 0.6, ease, delay: 0.15 }}
                className="text-[clamp(2.6rem,7vw,5rem)] leading-[0.98] font-bold tracking-[-0.045em] text-balance">One family. Many plans.</motion.h1>
              <motion.p initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.6, ease, delay: 0.25 }}
                className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                A private, shared home for your family’s calendar, tasks, chores, goals, conversations and files.
              </motion.p>
              <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.6, ease, delay: 0.35 }} className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink href={primary.href} className="h-12 gap-2 rounded-full px-6 text-base">{primary.label}<ArrowRight aria-hidden="true" /></ButtonLink>
                <ButtonLink href="#how" variant="outline" className="h-12 rounded-full bg-panel px-6 text-base">See how it works</ButtonLink>
              </motion.div>
              <p className="mt-6 text-sm text-muted-foreground">Your schedule. Your people. Your say.</p>
            </div>
          </section>

          {/* What is it */}
          <Reveal>
            <section className="rounded-[2rem] bg-panel p-6 sm:p-12">
              <Eyebrow>In a few words</Eyebrow>
              <Heading>What is FamSync?</Heading>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                FamSync keeps everyone in your family on the same page. Plan the week, share the work, talk it through and keep important files in one place — with you deciding who sees what.
              </p>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {[
                  { n: "01", t: "One shared week", d: "Events, repeating plans and reminders in your family’s own time zone, on Today and the calendar.", tone: tint.sage, icon: CalendarDays },
                  { n: "02", t: "Work shared fairly", d: "Assign tasks and chores, see what’s overdue, and track goals that fill in as tasks get done.", tone: tint.peach, icon: Target },
                  { n: "03", t: "Privacy on every item", d: "Only me, selected members or everyone — on events, tasks, goals and folders alike.", tone: tint.lavender, icon: Lock },
                ].map((c, i) => (
                  <Reveal key={c.n} delay={i * 0.08}>
                    <div className="h-full rounded-3xl bg-muted/70 p-6">
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground tabular-nums">{c.n}</span>
                        <span className={"grid size-10 place-items-center rounded-2xl " + c.tone}><c.icon className="size-5" aria-hidden="true" /></span></div>
                      <p className="mt-8 text-lg font-semibold">{c.t}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.d}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          </Reveal>

          {/* How it works */}
          <section id="how" className="scroll-mt-24 py-14 sm:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <Reveal>
                <Eyebrow>How it works</Eyebrow>
                <Heading>Set up in an evening</Heading>
                <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">Create your family, invite the people who matter, and start planning together.</p>
                <Steps items={[
                  { title: "Create your family", text: "Name it and set your home time zone. You’re the owner." },
                  { title: "Invite by email", text: "Each person gets a private link that works for seven days." },
                  { title: "Plan together", text: "Add this week’s events, hand out chores and start a conversation." },
                ]} />
              </Reveal>
              <Reveal delay={0.1}>
                <div className="rounded-[2rem] bg-peach/70 p-5 sm:p-10"><div className="mx-auto max-w-md"><CalendarDemo /></div></div>
              </Reveal>
            </div>
          </section>

          <div id="features" className="scroll-mt-24 pt-10">
            <Reveal className="text-center">
              <Eyebrow>Everything in one place</Eyebrow>
              <Heading className="mx-auto max-w-2xl">Built for the way families actually run</Heading>
            </Reveal>
            <Feature eyebrow="Tasks and chores" title={<>Share the work.<br />See it get done.</>}
              text="Hand out tasks, set chores that repeat, and link them to the events they’re for. When an event moves, its tasks can move with it."
              points={["Assign to anyone in the family", "Daily, weekly or monthly chores", "Overdue work stands out on Today"]} demo={<TasksDemo />} />
            <Feature flip eyebrow="Goals" title={<>Progress you can<br />all see</>}
              text="Set family or personal goals as a checklist, a number to reach or a simple done. Link tasks to a checklist and it fills in as they’re completed."
              points={["Checklists, numbers or a simple done", "Linked tasks update progress automatically", "Family and personal goals side by side"]} demo={<GoalsDemo />} />
            <Feature eyebrow="Channels and messages" title={<>Talk it through,<br />then act on it</>}
              text="Channels for the house, the trip or the school run, plus one-to-one messages. Mention someone, reply in a thread, or turn a message into a task."
              points={["Channels and direct messages", "Mentions, replies and reactions", "Create a task or link an event from any message"]} demo={<ChatDemo />} />
            <Feature flip eyebrow="Folders and files" title={<>Important files,<br />right people</>}
              text="Keep school forms, medical notes and trip plans in folders. Every file follows its folder’s audience, and conversation folders follow the channel."
              points={["Family folders and channel folders", "Preview images and text in the app", "Download links expire within a minute"]} demo={<FilesDemo />} />
          </div>

          {/* Privacy */}
          <Reveal>
            <section id="privacy" className="mt-6 scroll-mt-24 rounded-[2rem] bg-sage/60 p-6 sm:p-12">
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div>
                  <Eyebrow>Your family, your rules</Eyebrow>
                  <Heading>Shared by default.<br />Private when it matters.</Heading>
                  <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
                    Not everything is for everyone. Decide who sees each event, task, goal and folder — and FamSync keeps it that way everywhere, from Today to search.
                  </p>
                  <ul className="mt-6 grid gap-2.5">
                    {["Only me, selected members or the whole family", "Guests see only the one channel they’re invited to", "Removing someone ends their access straight away"].map((p) =>
                      <li key={p} className="flex gap-3 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-sage-foreground" aria-hidden="true" />{p}</li>)}
                  </ul>
                </div>
                <div className="mx-auto w-full max-w-md"><PrivacyDemo /></div>
              </div>
            </section>
          </Reveal>

          {/* FAQ */}
          <section id="faq" className="scroll-mt-24 py-14 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <Reveal>
                <Eyebrow>A little curiosity is welcome</Eyebrow>
                <Heading>Good questions</Heading>
                <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted-foreground">A few things families ask before they start.</p>
              </Reveal>
              <Reveal delay={0.1}><Faq /></Reveal>
            </div>
          </section>

          {/* Closing */}
          <Reveal>
            <section className="relative mb-16 overflow-hidden rounded-[2rem] bg-accent">
              <div className="grid items-end gap-6 md:grid-cols-[1.1fr_0.9fr]">
                <div className="p-6 pb-0 sm:p-12 md:pb-12">
                  <Eyebrow>Ready when you are</Eyebrow>
                  <Heading>Your family.<br />In sync.</Heading>
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">Start with your family and one week. Invite everyone when you’re ready.</p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <ButtonLink href={primary.href} className="h-12 gap-2 rounded-full px-6 text-base">{primary.label}<ArrowUpRight aria-hidden="true" /></ButtonLink>
                    {!signedIn && <ButtonLink href="/sign-in/" variant="outline" className="h-12 rounded-full px-6 text-base">Sign in</ButtonLink>}
                  </div>
                </div>
                <img data-dim src="/landing/family-right.webp" alt="A teenager with a soccer ball, a girl holding a plant and a grandmother with a notebook" width={720} height={805} loading="lazy" className="mx-auto h-auto w-full max-w-xs [mask-image:linear-gradient(to_right,transparent,black_22%,black_88%,transparent),linear-gradient(to_bottom,transparent,black_12%)] [mask-composite:intersect] md:mr-6 md:max-w-sm" />
              </div>
            </section>
          </Reveal>
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6">
            <p className="inline-flex items-center gap-2"><ModuleIcon name="families" className="size-4" />FamSync — plan, share and talk as a family.</p>
            <div className="flex gap-4"><a href="/sign-in/" className="hover:text-foreground">Sign in</a><a href="/sign-up/" className="hover:text-foreground">Create account</a></div>
          </div>
        </footer>
      </div>
    </MotionProvider>
  );
}
