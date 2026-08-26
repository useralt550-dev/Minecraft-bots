// Standalone launcher: `node launch.js` connects all 5 soldiers directly to your
// Minecraft server and streams their activity to the terminal.
const { loadSettings, getSettings } = require("./config");
const { startArmy, stopArmy } = require("./botManager");
const { getLogs, getBots } = require("./state");

loadSettings();
const s = getSettings();

console.log("\n  ==================================================");
console.log("  LEGION COMMAND — Bot Army Launcher");
console.log("  ==================================================");
console.log(`  Server:    ${s.server_ip}:${s.server_port}`);
console.log(`  Version:   ${s.minecraft_version}`);
console.log(`  Owner:     ${s.owner}`);
console.log(`  Soldiers:  Soldier_1 .. Soldier_5`);
console.log("  --------------------------------------------------");
console.log("  Press Ctrl+C to stop all bots.\n");

// Tame raw connection errors (ECONNRESET etc.) into one readable line instead
// of a full stack trace that floods the terminal.
process.on("uncaughtException", (e) => {
  if (e && (e.code === "ECONNRESET" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT")) {
    console.log(`  [NET]  ${e.code} — server closed a connection (will retry)`);
    return;
  }
  console.log(`  [FATAL] ${e && e.message ? e.message : e}`);
});
process.on("unhandledRejection", (e) => {
  console.log(`  [REJECT] ${e && e.message ? e.message : e}`);
});

startArmy();

// Stream internal logs to the terminal so you can see what the bots are doing.
const seen = new Set();
setInterval(() => {
  for (const entry of getLogs()) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const t = new Date(entry.time).toLocaleTimeString();
    const tag = `[${entry.category}]`.padEnd(14);
    console.log(`  ${t}  ${tag}  ${entry.message}`);
  }
}, 400);

// Print a compact status row every ~5s.
let lastStatusPrint = 0;
setInterval(() => {
  const now = Date.now();
  if (now - lastStatusPrint < 5000) return;
  lastStatusPrint = now;
  const summary = Object.values(getBots())
    .map((b) => `${b.name}:${b.status}`)
    .join("  ");
  console.log(`  -- status: ${summary}`);
}, 1000);

// Graceful shutdown on Ctrl+C.
function shutdown() {
  console.log("\n  Stopping all bots...");
  stopArmy();
  setTimeout(() => process.exit(0), 600);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);