const Vec3 = require("vec3");
const { goals } = require("mineflayer-pathfinder");
const { GoalNear } = goals;
const { setupMovements } = require("./pathfinding");
const { getSettings } = require("./config");
const { isProtected } = require("./combatSafety");
const { BOT_NAMES, setStatus, addLog } = require("./state");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function owner() { return getSettings().owner || ""; }

function findPlayer(bot, name) {
  if (!name) return null;
  const lower = String(name).toLowerCase();
  const players = bot.players || {};
  const found = Object.values(players).find((p) => p.username && p.username.toLowerCase() === lower);
  return found && found.entity ? found : null;
}

function setTask(wrapper, mode, target) {
  if (wrapper.task) wrapper.task.cancel = true;
  const task = { mode, target, cancel: false, started: Date.now() };
  wrapper.task = task;
  setStatus(wrapper.name, { mode, target: target || null, command: mode });
  return task;
}

function taskActive(wrapper, task) {
  return wrapper.task === task && !task.cancel && wrapper.bot && wrapper.bot.entity;
}

function cancelTask(wrapper) {
  if (wrapper.task) wrapper.task.cancel = true;
  try {
    if (wrapper.bot && wrapper.bot.pathfinder) wrapper.bot.pathfinder.setGoal(null);
  } catch (e) {}
  setStatus(wrapper.name, { mode: "IDLE", command: null });
}

function botIndex(wrapper) { return BOT_NAMES.indexOf(wrapper.name); }

async function gotoWithRecovery(wrapper, x, y, z, range = 1) {
  const b = wrapper.bot;
  const goal = new GoalNear(Math.floor(x), Math.floor(y), Math.floor(z), range);
  try {
    await b.pathfinder.goto(goal);
    return true;
  } catch (e) {
    // stuck recovery: jump and retry once
    addLog("MOVEMENT", `${wrapper.name} stuck, attempting recovery`);
    try { b.setControlState("jump", true); await sleep(400); b.setControlState("jump", false); } catch (err) {}
    await sleep(200);
    try {
      await b.pathfinder.goto(goal);
      return true;
    } catch (e2) {
      throw new Error("no path / unreachable");
    }
  }
}

async function followEntity(wrapper, targetName, mode) {
  const b = wrapper.bot;
  const task = setTask(wrapper, mode, targetName);
  let notFoundCount = 0;
  while (taskActive(wrapper, task)) {
    const p = findPlayer(b, targetName);
    if (!p) {
      notFoundCount++;
      if (notFoundCount > 3) throw new Error(`Can't find ${targetName}`);
      await sleep(1000);
      continue;
    }
    notFoundCount = 0;
    try {
      const { GoalFollow } = require("mineflayer-pathfinder").goals;
      await b.pathfinder.goto(new GoalFollow(p.entity, 2));
    } catch (e) {
      // interrupted by task change or stuck; loop will retry
    }
    await sleep(700);
  }
}

async function patrol(wrapper) {
  const b = wrapper.bot;
  const task = setTask(wrapper, "PATROL");
  const center = b.entity.position.clone();
  const waypoints = [
    [center.x + 10, center.y, center.z],
    [center.x, center.y, center.z + 10],
    [center.x - 10, center.y, center.z],
    [center.x, center.y, center.z - 10],
  ];
  let i = 0;
  while (taskActive(wrapper, task)) {
    const wp = waypoints[i % waypoints.length];
    try {
      await gotoWithRecovery(wrapper, wp[0], wp[1], wp[2]);
    } catch (e) {
      addLog("MOVEMENT", `${wrapper.name} patrol waypoint failed: ${e.message}`);
      i++;
      await sleep(500);
      continue;
    }
    i++;
    await sleep(400);
  }
}

async function regroup(wrapper) {
  const b = wrapper.bot;
  const o = findPlayer(b, owner());
  const base = o ? o.entity.position.clone() : b.entity.position.clone();
  setTask(wrapper, "REGROUP");
  try { await gotoWithRecovery(wrapper, base.x, base.y, base.z, 2); } catch (e) { throw new Error("can't regroup"); }
}

async function scatter(wrapper) {
  const b = wrapper.bot;
  const o = findPlayer(b, owner());
  const base = o ? o.entity.position.clone() : b.entity.position.clone();
  const i = botIndex(wrapper);
  const offsets = [[6, 0, 6], [-6, 0, -6], [6, 0, -6], [-6, 0, 6], [0, 0, 8]];
  const off = offsets[i] || [i * 3, 0, 0];
  setTask(wrapper, "SCATTER");
  try { await gotoWithRecovery(wrapper, base.x + off[0], base.y, base.z + off[2], 1); } catch (e) {}
}

async function lineup(wrapper) {
  const b = wrapper.bot;
  const o = findPlayer(b, owner());
  const base = o ? o.entity.position.clone() : b.entity.position.clone();
  const i = botIndex(wrapper);
  setTask(wrapper, "LINEUP");
  try { await gotoWithRecovery(wrapper, base.x + (i - 2) * 2, base.y, base.z + 3, 1); } catch (e) {}
}

function isFoodItem(bot, item) {
  if (!item) return false;
  const foodNames = ["bread", "apple", "cooked_beef", "beef", "cooked_porkchop", "porkchop", "cooked_cod", "cod", "cooked_salmon", "salmon", "cookie", "melon_slice", "carrot", "potato", "baked_potato", "cooked_mutton", "mutton", "cooked_chicken", "chicken", "sweet_berries", "glow_berries"];
  return foodNames.includes(item.name);
}

function findFood(bot) {
  return bot.inventory.items().find((it) => isFoodItem(bot, it));
}

async function heal(wrapper) {
  const b = wrapper.bot;
  const task = setTask(wrapper, "HEAL");
  let noFood = 0;
  while (taskActive(wrapper, task) && b.food < 18) {
    const food = findFood(b);
    if (!food) {
      noFood++;
      if (noFood > 1) throw new Error("No food in inventory");
      await sleep(1000);
      continue;
    }
    noFood = 0;
    try { await b.equip(food, "hand"); } catch (e) {}
    try { b.activateItem(); } catch (e) {}
    await sleep(1800);
    try { b.deactivateItem(); } catch (e) {}
  }
}

function findBestWeapon(bot) {
  const weapons = ["netherite_sword", "diamond_sword", "iron_sword", "stone_sword", "wooden_sword", "golden_sword"];
  for (const w of weapons) {
    const item = bot.inventory.items().find((it) => it.name === w);
    if (item) return item;
  }
  return null;
}

function findArmorFor(bot, slot) {
  const map = {
    helmet: ["netherite_helmet", "diamond_helmet", "iron_helmet", "golden_helmet", "chainmail_helmet", "leather_helmet"],
    chestplate: ["netherite_chestplate", "diamond_chestplate", "iron_chestplate", "golden_chestplate", "chainmail_chestplate", "leather_chestplate"],
    leggings: ["netherite_leggings", "diamond_leggings", "iron_leggings", "golden_leggings", "chainmail_leggings", "leather_leggings"],
    boots: ["netherite_boots", "diamond_boots", "iron_boots", "golden_boots", "chainmail_boots", "leather_boots"],
  };
  const names = map[slot] || [];
  for (const n of names) {
    const item = bot.inventory.items().find((it) => it.name === n);
    if (item) return item;
  }
  return null;
}

async function gearUp(wrapper) {
  const b = wrapper.bot;
  setTask(wrapper, "GEARUP");
  const missing = [];
  const weapon = findBestWeapon(b);
  if (weapon) { try { await b.equip(weapon, "hand"); } catch (e) {} } else missing.push("weapon");
  ["helmet", "chestplate", "leggings", "boots"].forEach((slot) => {
    const item = findArmorFor(b, slot);
    if (item) { b.equip(item, slot).catch(() => {}); } else missing.push(slot);
  });
  await sleep(500);
  if (missing.length) throw new Error("Missing equipment: " + missing.join(", "));
}

async function giveItems(wrapper, kind) {
  const b = wrapper.bot;
  const o = findPlayer(b, owner());
  if (!o) throw new Error(`Can't find ${owner()}`);
  setTask(wrapper, "GIVE");
  try { await gotoWithRecovery(wrapper, o.entity.position.x, o.entity.position.y, o.entity.position.z, 2); } catch (e) {}
  const items = b.inventory.items().filter((it) => kind === "food" ? isFoodItem(b, it) : true);
  if (!items.length) throw new Error("No items to give");
  for (const it of items.slice(0, kind === "food" ? 5 : 10)) {
    try { await b.tossStack(it); } catch (e) {}
    await sleep(200);
  }
}

function isBuildingBlock(item) {
  if (!item) return false;
  const names = ["cobblestone", "stone", "dirt", "oak_planks", "spruce_planks", "birch_planks", "netherrack", "andesite", "granite", "diorite", "deepslate", "cobbled_deepslate", "bricks", "sandstone", "terracotta"];
  return names.includes(item.name);
}

async function buildAround(wrapper) {
  const b = wrapper.bot;
  const o = findPlayer(b, owner());
  if (!o) throw new Error(`Can't find ${owner()}`);
  const blocks = b.inventory.items().filter(isBuildingBlock);
  const total = blocks.reduce((s, it) => s + it.count, 0);
  if (total < 8) throw new Error("Not enough blocks");
  setTask(wrapper, "BUILD");
  const pos = o.entity.position;
  const offsets = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1]];
  for (const off of offsets) {
    const target = b.blockAt(pos.offset(off[0], 0, off[2]));
    if (target && target.name === "air") {
      try {
        await b.equip(blocks[0], "hand");
        const face = b.blockAt(pos.offset(off[0], -1, off[2]));
        if (face && face.name !== "air") await b.placeBlock(face, new Vec3(0, 1, 0));
      } catch (e) {
        addLog("ERRORS", `${wrapper.name} build failed at ${off}: ${e.message}`);
      }
    }
  }
}

async function setRespawn(wrapper) {
  const b = wrapper.bot;
  setTask(wrapper, "SETRESPAWN");
  let bed = null;
  try {
    bed = b.findBlock({
      matching: (block) => block && block.name && block.name.includes("bed"),
      maxDistance: 32,
      count: 1,
    });
  } catch (e) {}
  if (!bed) {
    b.chat("No nearby bed found.");
    throw new Error("No nearby bed found.");
  }
  try { await gotoWithRecovery(wrapper, bed.position.x, bed.position.y, bed.position.z, 2); } catch (e) {}
  try { await b.lookAt(bed.position); } catch (e) {}
  try { await b.activateBlock(bed); } catch (e) {}
}

async function equipToolFor(wrapper, block) {
  const b = wrapper.bot;
  const tools = ["netherite_pickaxe", "diamond_pickaxe", "iron_pickaxe", "stone_pickaxe", "wooden_pickaxe", "golden_pickaxe"];
  for (const t of tools) {
    const item = b.inventory.items().find((it) => it.name === t);
    if (item) { try { await b.equip(item, "hand"); } catch (e) {} return; }
  }
}

async function collect(wrapper, blockName) {
  const b = wrapper.bot;
  const mcData = require("minecraft-data")(b.version);
  const task = setTask(wrapper, "COLLECT", blockName);
  const ids = [];
  if (mcData.blocksByName[blockName]) ids.push(mcData.blocksByName[blockName].id);
  else {
    const lower = blockName.toLowerCase();
    Object.values(mcData.blocksByName).forEach((bl) => { if (bl.name.includes(lower)) ids.push(bl.id); });
  }
  if (!ids.length) throw new Error(`Unknown block: ${blockName}`);
  let foundCount = 0;
  while (taskActive(wrapper, task) && foundCount < 16) {
    let found = null;
    try {
      found = b.findBlock({ matching: ids, maxDistance: 64, count: 1 });
    } catch (e) { break; }
    if (!found) {
      addLog("COLLECTION", `${wrapper.name}: no more ${blockName} nearby`);
      break;
    }
    try {
      await gotoWithRecovery(wrapper, found.position.x, found.position.y, found.position.z, 2);
      await equipToolFor(wrapper, found);
      await b.dig(found);
      foundCount++;
      addLog("COLLECTION", `${wrapper.name} mined ${found.name}`);
      await sleep(500);
    } catch (e) {
      addLog("COLLECTION", `${wrapper.name} collect failed: ${e.message}`);
      break;
    }
  }
  if (foundCount === 0) throw new Error(`No ${blockName} nearby`);
}

async function goToCoords(wrapper, x, y, z) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error("Invalid coordinates");
  const b = wrapper.bot;
  const task = setTask(wrapper, "GOTO", `${x},${y},${z}`);
  try {
    await gotoWithRecovery(wrapper, x, y, z, 1);
    b.chat(`Arrived at ${x} ${y} ${z}.`);
  } catch (e) {
    b.chat(`Can't reach ${x} ${y} ${z}: ${e.message}`);
    throw e;
  }
}

async function attackEntity(wrapper, targetName) {
  if (isProtected(targetName)) throw new Error("I can't attack the owner.");
  const b = wrapper.bot;
  const p = findPlayer(b, targetName);
  if (!p) throw new Error(`Can't find ${targetName}`);
  const task = setTask(wrapper, "ATTACK", targetName);
  const target = p.entity;
  while (taskActive(wrapper, task)) {
    try { b.pvp.attack(target); } catch (e) { addLog("COMBAT", `${wrapper.name} attack error: ${e.message}`); }
    await sleep(600);
    if (!p.entity || (p.entity.health !== undefined && p.entity.health <= 0)) break;
  }
}

async function killHostiles(wrapper) {
  const b = wrapper.bot;
  const task = setTask(wrapper, "COMBAT");
  while (taskActive(wrapper, task)) {
    const hostile = Object.values(b.entities || {}).find((e) => {
      if (!e || !e.position) return false;
      if (e.kind !== "hostile" && !["zombie", "skeleton", "creeper", "spider", "enderman", "witch"].includes(e.name)) return false;
      return b.entity.position.distanceTo(e.position) < 16;
    });
    if (!hostile) break;
    try { b.pvp.attack(hostile); await sleep(800); } catch (e) {}
  }
}

async function hunt(wrapper, mobName) {
  const b = wrapper.bot;
  const task = setTask(wrapper, "HUNT", mobName);
  const lower = mobName.toLowerCase();
  while (taskActive(wrapper, task)) {
    const target = Object.values(b.entities || {}).find((e) => {
      if (!e || !e.position || !e.name) return false;
      return e.name.toLowerCase().includes(lower) && b.entity.position.distanceTo(e.position) < 40;
    });
    if (!target) throw new Error(`No ${mobName} nearby`);
    try { b.pvp.attack(target); } catch (e) {}
    await sleep(1000);
  }
}

async function run(wrapper, parsed, source) {
  const b = wrapper.bot;
  if (!b || !b.entity) throw new Error("Bot not connected");

  switch (parsed.action) {
    case "follow":
      followEntity(wrapper, owner(), "FOLLOW").catch((e) => addLog("MOVEMENT", `${wrapper.name} follow: ${e.message}`));
      return "Following.";

    case "come":
      (async () => {
        try { await followEntity(wrapper, owner(), "COME"); b.chat("Arrived."); }
        catch (e) { b.chat(`Unable to reach owner: ${e.message}`); addLog("ERRORS", `${wrapper.name} come: ${e.message}`); }
      })();
      return "Coming.";

    case "guard": {
      const t = (parsed.params && parsed.params.target) || owner();
      (async () => {
        try { await followEntity(wrapper, t, "GUARD"); }
        catch (e) { addLog("ERRORS", `${wrapper.name} guard: ${e.message}`); b.chat(`Can't find ${t}.`); }
      })();
      return (parsed.params && parsed.params.target) ? `Guarding ${parsed.params.target}.` : "Guarding.";
    }

    case "defend":
      (async () => { try { await followEntity(wrapper, owner(), "DEFEND"); } catch (e) { addLog("ERRORS", `${wrapper.name} defend: ${e.message}`); } })();
      return "Defending you.";

    case "patrol":
      patrol(wrapper).catch((e) => addLog("MOVEMENT", `${wrapper.name} patrol: ${e.message}`));
      return "Patrolling.";

    case "regroup":
      regroup(wrapper).catch((e) => {});
      return "Regrouping.";

    case "scatter":
      scatter(wrapper).catch((e) => {});
      return "Scattering.";

    case "lineup":
      lineup(wrapper).catch((e) => {});
      return "Lining up.";

    case "heal":
      heal(wrapper).catch((e) => { throw e; });
      return "Healing.";

    case "gearUp":
      gearUp(wrapper).catch((e) => {});
      return "Gearing up.";

    case "giveFood":
      giveItems(wrapper, "food").catch((e) => { addLog("ERRORS", `${wrapper.name} give food: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return "Bringing food.";

    case "giveItems":
      giveItems(wrapper, "all").catch((e) => { addLog("ERRORS", `${wrapper.name} give items: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return "Bringing items.";

    case "build":
      buildAround(wrapper).catch((e) => { addLog("ERRORS", `${wrapper.name} build: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return "Building around you.";

    case "setRespawn":
      setRespawn(wrapper).catch((e) => { addLog("ERRORS", `${wrapper.name} set respawn: ${e.message}`); });
      return "Setting respawn.";

    case "collect":
      collect(wrapper, parsed.params.block).catch((e) => { addLog("COLLECTION", `${wrapper.name} collect: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return `Collecting ${parsed.params.block}.`;

    case "goto":
      goToCoords(wrapper, parsed.params.x, parsed.params.y, parsed.params.z).catch((e) => {});
      return `Going to ${parsed.params.x} ${parsed.params.y} ${parsed.params.z}.`;

    case "attack": {
      const t = parsed.params.target;
      if (isProtected(t)) return "I can't attack the owner.";
      attackEntity(wrapper, t).catch((e) => { addLog("COMBAT", `${wrapper.name} attack: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return `Attacking ${t}.`;
    }

    case "killAll":
      killHostiles(wrapper).catch((e) => {});
      return "Killing hostiles.";

    case "hunt":
      hunt(wrapper, parsed.params.mob).catch((e) => { addLog("COMBAT", `${wrapper.name} hunt: ${e.message}`); b.chat(`Failed: ${e.message}`); });
      return `Hunting ${parsed.params.mob}.`;

    case "coords": {
      const p = b.entity.position;
      return `Coordinates: ${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`;
    }

    case "status": {
      const p = b.entity.position;
      return `Status: ${wrapper.task ? wrapper.task.mode : "IDLE"}, HP ${Math.round(b.health)}, Food ${Math.round(b.food)}, at ${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`;
    }

    case "stop":
      cancelTask(wrapper);
      return "Stopping.";

    default:
      throw new Error("Unknown command");
  }
}

module.exports = { run, cancelTask };