"use client";

const emojis = "😀 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😢 😭 😡 😴 🤗 🙄 😮 🥳 🤒 🤩 👍 👎 👏 🙏 🙌 👋 💪 🤝 ✌️ 👌 ❤️ 💛 💚 💙 💜 💔 🎉 🎂 🎁 🎈 ⭐ 🔥 ✅ ❌ ❓ ❗ ⏰ 📅 🏠 🚗 🏫 🛒 🍕 🍎 ☕ 🐶 🐱 ⚽ 🌧️ ☀️".split(" ");

export function EmojiGrid({ label, onPick }: { label: string; onPick: (emoji: string) => void }) {
  return (
    <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
      {emojis.map((emoji) => <button key={emoji} type="button" aria-label={label + " " + emoji} className="grid size-8 place-items-center rounded-lg text-lg hover:bg-accent focus-visible:bg-accent" onClick={() => onPick(emoji)}>{emoji}</button>)}
    </div>
  );
}
