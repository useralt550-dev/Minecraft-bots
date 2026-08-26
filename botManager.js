const { BOT_NAMES, setBotInstance, setArmyRunning, getArmyRunning, addLog } = require("./state");
const BotWrapper = require("./bot");

const instances = {};

function ensureBot(name) {
  if (!instances[name]) {
    const b = new BotWrapper(name);
    instances[name] = b;
    setBotInstance(name, b);
  }
  return instances[name];
}

// pre-create instances
BOT_NAMES.forEach(ensureBot);

function startArmy() {
  addLog("SYSTEM", "Starting army...");
  BOT_NAMES.forEach((name) => {
    const b = ensureBot(name);
    if (!b.isConnected()) b.connect();
  });
  setArmyRunning(true);
}

function stopArmy() {
  addLog("SYSTEM", "Stopping army...");
  BOT_NAMES.forEach((name) => {
    const b = instances[name];
    if (b) b.disconnect(true);
  });
  setArmyRunning(false);
}

function reconnectAll() {
  addLog("SYSTEM", "Reconnecting all bots...");
  BOT_NAMES.forEach((name) => {
    const b = instances[name];
    if (b) b.reconnect();
  });
}

function reconnectBot(name) {
  const b = instances[name];
  if (b) {
    addLog("SYSTEM", `Reconnecting ${name}...`);
    b.reconnect();
  }
}

function getBot(name) {
  return instances[name];
}

module.exports = { startArmy, stopArmy, reconnectAll, reconnectBot, getBot, ensureBot };