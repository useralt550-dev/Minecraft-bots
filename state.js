const BOT_NAMES = ["Soldier_1", "Soldier_2", "Soldier_3", "Soldier_4", "Soldier_5"];

let wss = null;
const state = {
  bots: {},
  logs: [],
  queue: [],
  armyRunning: false,
};
const instances = {};

function setWsServer(s) { wss = s; }

function broadcast(msg) {
  if (!wss) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) c.send(data);
  });
}

function initBot(name) {
  state.bots[name] = {
    name,
    status: "OFFLINE",
    health: 0,
    food: 0,
    mode: "IDLE",
    target: null,
    x: null,
    y: null,
    z: null,
    command: null,
    lastResponse: null,
    lastError: null,
    reconnectAttempts: 0,
  };
}
BOT_NAMES.forEach(initBot);

function getStatus(name) { return state.bots[name]; }

function setStatus(name, patch) {
  state.bots[name] = { ...state.bots[name], ...patch };
  broadcast({ type: "bot", data: state.bots[name] });
}

function addLog(category, message) {
  const entry = {
    id: Date.now() + Math.random(),
    time: new Date().toISOString(),
    category,
    message: String(message),
  };
  state.logs.push(entry);
  if (state.logs.length > 600) state.logs.shift();
  broadcast({ type: "log", data: entry });
  return entry;
}

function getLogs() { return state.logs; }
function getBots() { return state.bots; }
function setArmyRunning(v) { state.armyRunning = v; broadcast({ type: "army", data: { running: v } }); }
function getArmyRunning() { return state.armyRunning; }

function addQueueItem(item) {
  state.queue.push(item);
  if (state.queue.length > 50) state.queue.shift();
  broadcast({ type: "queue", data: state.queue });
  return item;
}

function updateQueueItem(id, patch) {
  const i = state.queue.findIndex((q) => q.id === id);
  if (i >= 0) {
    state.queue[i] = { ...state.queue[i], ...patch };
    broadcast({ type: "queue", data: state.queue });
  }
}

function getQueue() { return state.queue; }

function getState() {
  return {
    bots: state.bots,
    logs: state.logs.slice(-200),
    queue: state.queue,
    armyRunning: state.armyRunning,
  };
}

function setBotInstance(name, bot) { instances[name] = bot; }
function getBotInstance(name) { return instances[name]; }
function getAllInstances() { return Object.values(instances); }

module.exports = {
  BOT_NAMES,
  setWsServer,
  broadcast,
  initBot,
  getStatus,
  setStatus,
  addLog,
  getLogs,
  getBots,
  setArmyRunning,
  getArmyRunning,
  addQueueItem,
  updateQueueItem,
  getQueue,
  getState,
  setBotInstance,
  getBotInstance,
  getAllInstances,
};