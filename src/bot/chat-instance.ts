import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { registerHandlers } from "./handlers";

// Lazy singleton: constructing `Chat` validates adapter credentials (e.g.
// TELEGRAM_BOT_TOKEN) eagerly. A top-level `new Chat(...)` would throw during
// `next build`'s page-data collection for ANY fork that hasn't set up
// Telegram yet, even if Telegram isn't used. Mirrors the `getDb()` pattern.
let _bot: Chat<{ telegram: ReturnType<typeof createTelegramAdapter> }> | null = null;

export function getBot() {
  if (!_bot) {
    _bot = new Chat({
      userName: "kairo_pa_bot",
      adapters: {
        telegram: createTelegramAdapter(),
      },
      // Auto-detects REDIS_URL, which the Upstash Marketplace integration
      // provisions alongside the KV_REST_API_* vars (see docs/ASSUMPTIONS.md).
      state: createRedisState(),
    }).registerSingleton();
    registerHandlers(_bot);
  }
  return _bot;
}
