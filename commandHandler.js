const { parseCommand, helpText } = require("./commandParser");
const {
  BOT_NAMES,
  getBotInstance,
  addQueueItem,
  updateQueueItem,
  addLog,
  setStatus,
} = require("./state");
const behaviors = require("./behaviors");

function resolveTargets(target) {
  if (!target || target === "ALL") {
    return BOT_NAMES.map(getBotInstance).filter(Boolean);
  }
  const b = getBotInstance(target);
  return b ? [b] : [];
}

function firstOnlineBot() {
  return BOT_NAMES.map(getBotInstance).find((b) => b && b.isConnected());
}

async function runParsed(parsed, source = "web") {
  const q = addQueueItem({
    id: Date.now() + Math.random(),
    command: parsed.raw,
    target: parsed.target,
    status: "RUNNING",
    createdAt: Date.now(),
  });
  addLog("COMMANDS", `Command: "${parsed.raw}" -> ${parsed.target}`);

  if (parsed.action === "help") {
    const b = firstOnlineBot();
    const text = helpText();
    if (b) {
      if (source === "chat") b.chat(text);
      updateQueueItem(q.id, { status: "COMPLETED" });
      return { [b.name]: "Help displayed." };
    }
    updateQueueItem(q.id, { status: "FAILED" });
    return { _none: "No online bots to display help." };
  }

  const bots = resolveTargets(parsed.target);
  if (bots.length === 0) {
    updateQueueItem(q.id, { status: "FAILED" });
    addLog("ERRORS", `No bots available for command: ${parsed.raw}`);
    return {};
  }

  const responses = {};
  for (const bot of bots) {
    try {
      const ack = await behaviors.run(bot, parsed, source);
      responses[bot.name] = ack;
      setStatus(bot.name, { lastResponse: ack });
      addLog("COMMANDS", `${bot.name}: ${ack}`);
      if (source === "chat") bot.chat(ack);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      responses[bot.name] = "Error: " + msg;
      setStatus(bot.name, { lastError: msg });
      addLog("ERRORS", `${bot.name} command failed: ${msg}`);
      if (source === "chat") bot.chat(`Failed: ${msg}`);
    }
  }
  updateQueueItem(q.id, { status: "COMPLETED", responses });
  return responses;
}

// Dedup chat commands (all 5 bots receive the same chat event)
const recentChat = new Map();
function processChatCommand(message, sourceBot) {
  const key = String(message || "").toLowerCase().trim();
  if (!key) return;
  const now = Date.now();
  if (recentChat.has(key) && now - recentChat.get(key) < 3000) return;
  recentChat.set(key, now);

  const parsed = parseCommand(message);
  if (!parsed) return;

  addLog("COMMANDS", `Owner chat command: ${message}`);
  runParsed(parsed, "chat").catch((e) => addLog("ERRORS", "Chat command error: " + (e.message || e)));
}

module.exports = { runParsed, processChatCommand, resolveTargets };