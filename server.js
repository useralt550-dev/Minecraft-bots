const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const { getSettings, saveSettings, loadSettings } = require("./config");
const {
  getState,
  getBots,
  getLogs,
  setArmyRunning,
  getArmyRunning,
  setWsServer,
  addLog,
} = require("./state");
const { startArmy, stopArmy, reconnectAll, reconnectBot } = require("./botManager");
const { runParsed } = require("./commandHandler");
const { parseCommand } = require("./commandParser");

loadSettings();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = getSettings().web_port || 3001;

// --- REST API ---
app.get("/api/status", (req, res) => {
  res.json({ armyRunning: getArmyRunning(), bots: getBots() });
});

app.get("/api/bots", (req, res) => res.json(getBots()));
app.get("/api/settings", (req, res) => res.json(getSettings()));
app.get("/api/logs", (req, res) => res.json(getLogs()));

app.post("/api/settings", (req, res) => {
  const body = req.body || {};
  const allowed = ["web_port", "server_ip", "server_port", "minecraft_version", "owner", "reconnect_delay", "max_reconnect_attempts"];
  const patch = {};
  allowed.forEach((k) => { if (body[k] !== undefined) patch[k] = body[k]; });
  const saved = saveSettings(patch);
  addLog("SYSTEM", `Settings updated: ${Object.keys(patch).join(", ")}`);
  res.json(saved);
});

app.post("/api/army/start", (req, res) => {
  startArmy();
  res.json({ ok: true });
});

app.post("/api/army/stop", (req, res) => {
  stopArmy();
  res.json({ ok: true });
});

app.post("/api/army/reconnect", (req, res) => {
  reconnectAll();
  res.json({ ok: true });
});

app.post("/api/command", async (req, res) => {
  const { command, target } = req.body || {};
  if (!command || typeof command !== "string") return res.status(400).json({ error: "Invalid command" });
  const parsed = parseCommand(command);
  if (!parsed) return res.status(400).json({ error: "Unknown command: " + command });
  if (target) parsed.target = target;
  try {
    const responses = await runParsed(parsed, "web");
    res.json({ responses });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post("/api/bots/:botName/command", async (req, res) => {
  const { botName } = req.params;
  const { command } = req.body || {};
  if (!command) return res.status(400).json({ error: "Invalid command" });
  const parsed = parseCommand(command);
  if (!parsed) return res.status(400).json({ error: "Unknown command: " + command });
  parsed.target = botName;
  try {
    const responses = await runParsed(parsed, "web");
    res.json({ responses });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post("/api/bots/:botName/reconnect", (req, res) => {
  reconnectBot(req.params.botName);
  res.json({ ok: true });
});

// --- HTTP + WebSocket server ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/" });
setWsServer(wss);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "state", data: getState() }));
});

server.listen(PORT, () => {
  addLog("SYSTEM", `Bot control API listening on http://localhost:${PORT}`);
  console.log(`\n  Bot Army Control API running on http://localhost:${PORT}`);
  console.log(`  Point the dashboard backend URL to this address.\n`);
});