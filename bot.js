const mineflayer = require("mineflayer");
const pathfinder = require("mineflayer-pathfinder");
const pvp = require("mineflayer-pvp");
const armorManager = require("mineflayer-armor-manager");
const { setupMovements } = require("./pathfinding");
const { getSettings } = require("./config");
const { setStatus, addLog } = require("./state");
const { processChatCommand } = require("./commandHandler");
const { cancelTask } = require("./behaviors");

class BotWrapper {
  constructor(name) {
    this.name = name;
    this.bot = null;
    this.reconnectAttempts = 0;
    this.shouldRun = false;
    this.task = null;
    this.reconnectTimer = null;
  }

  connect() {
    this.shouldRun = true;
    this._spawn();
  }

  _spawn() {
    const s = getSettings();
    setStatus(this.name, { status: "CONNECTING", lastError: null });
    addLog("CONNECTION", `${this.name} connecting to ${s.server_ip}:${s.server_port} (MC ${s.minecraft_version})`);

    let bot;
    try {
      bot = mineflayer.createBot({
        host: s.server_ip,
        port: s.server_port,
        username: this.name,
        version: s.minecraft_version,
        hideErrors: false,
      });
    } catch (e) {
      setStatus(this.name, { status: "ERROR", lastError: e.message });
      addLog("ERRORS", `${this.name} create error: ${e.message}`);
      this._scheduleReconnect();
      return;
    }

    this.bot = bot;
    this._bind();
  }

  _bind() {
    const bot = this.bot;

    bot.once("spawn", () => {
      try {
        bot.loadPlugin(pathfinder.pathfinder);
        bot.loadPlugin(pvp);
        bot.loadPlugin(armorManager);
        setupMovements(bot);
      } catch (e) {
        addLog("ERRORS", `${this.name} plugin load: ${e.message}`);
      }

      this.reconnectAttempts = 0;
      const p = bot.entity.position;
      setStatus(this.name, {
        status: "ONLINE",
        health: Math.round(bot.health),
        food: Math.round(bot.food),
        x: Math.round(p.x),
        y: Math.round(p.y),
        z: Math.round(p.z),
        mode: "IDLE",
        reconnectAttempts: 0,
      });
      addLog("CONNECTION", `${this.name} connected`);
    });

    bot.on("health", () => {
      setStatus(this.name, { health: Math.round(bot.health), food: Math.round(bot.food) });
    });

    bot.on("move", () => {
      if (!bot.entity) return;
      const p = bot.entity.position;
      setStatus(this.name, { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) });
    });

    bot.on("chat", (username, message) => {
      const owner = String(getSettings().owner || "").toLowerCase();
      if (username.toLowerCase() !== owner) return;
      processChatCommand(message, this);
    });

    bot.on("kicked", (reason) => {
      addLog("CONNECTION", `${this.name} kicked: ${reason}`);
      setStatus(this.name, { lastError: "kicked: " + reason });
    });

    bot.on("error", (err) => {
      addLog("ERRORS", `${this.name} error: ${err.message}`);
      setStatus(this.name, { lastError: err.message });
    });

    bot.on("end", () => {
      cancelTask(this);
      setStatus(this.name, { status: "OFFLINE", mode: "IDLE", command: null });
      addLog("CONNECTION", `${this.name} disconnected`);
      this.bot = null;
      if (this.shouldRun) this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (!this.shouldRun) return;
    if (this.reconnectTimer) return;
    const s = getSettings();
    this.reconnectAttempts++;
    if (this.reconnectAttempts > (s.max_reconnect_attempts || 10)) {
      setStatus(this.name, { status: "ERROR", lastError: "Max reconnect attempts reached" });
      addLog("ERRORS", `${this.name} max reconnect attempts reached`);
      return;
    }
    const base = s.reconnect_delay || 5;
    const delay = Math.min(base * Math.pow(1.5, this.reconnectAttempts - 1), 60);
    setStatus(this.name, { status: "RECONNECTING", reconnectAttempts: this.reconnectAttempts });
    addLog("CONNECTION", `${this.name} reconnecting in ${Math.round(delay)}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldRun) this._spawn();
    }, delay * 1000);
  }

  reconnect() {
    this.reconnectAttempts = 0;
    this.shouldRun = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.bot) { try { this.bot.quit(); } catch (e) {} this.bot = null; }
    this._spawn();
  }

  disconnect(permanent) {
    this.shouldRun = !permanent;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    cancelTask(this);
    if (this.bot) { try { this.bot.quit(); } catch (e) {} }
    this.bot = null;
    setStatus(this.name, { status: "OFFLINE", mode: "IDLE", command: null });
  }

  isConnected() {
    return !!(this.bot && this.bot.entity);
  }

  chat(msg) {
    if (this.bot) {
      try { this.bot.chat(msg); } catch (e) {}
    }
  }
}

module.exports = BotWrapper;