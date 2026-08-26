const BOT_NAMES = ["Soldier_1", "Soldier_2", "Soldier_3", "Soldier_4", "Soldier_5"];

function normalize(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function parseAction(s) {
  if (s === "help" || s === "help me") return { action: "help" };
  if (s === "follow") return { action: "follow" };
  if (s === "come") return { action: "come" };
  if (s === "patrol") return { action: "patrol" };
  if (s === "regroup") return { action: "regroup" };
  if (s === "scatter") return { action: "scatter" };
  if (s === "lineup") return { action: "lineup" };
  if (s === "heal") return { action: "heal" };
  if (s === "gear up" || s === "gearup") return { action: "gearUp" };
  if (s === "defend me" || s === "defend") return { action: "defend" };
  if (s === "give me food") return { action: "giveFood" };
  if (s === "give me stuff" || s === "give me items") return { action: "giveItems" };
  if (s === "build around me" || s === "build") return { action: "build" };
  if (s === "set respawn nearby" || s === "set respawn" || s === "setrespawn") return { action: "setRespawn" };
  if (s === "give coordinates" || s === "give cordinates" || s === "coords" || s === "coordinates") return { action: "coords" };
  if (s === "status") return { action: "status" };
  if (s === "stop") return { action: "stop" };
  if (s === "kill all" || s === "killall") return { action: "killAll" };

  let m;
  if ((m = s.match(/^guard(?:\s+(.+))?$/))) return { action: "guard", params: { target: m[1] } };
  if ((m = s.match(/^collect\s+(.+)$/))) return { action: "collect", params: { block: m[1] } };
  if ((m = s.match(/^go to\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/))) return { action: "goto", params: { x: +m[1], y: +m[2], z: +m[3] } };
  if ((m = s.match(/^attack\s+(.+)$/))) return { action: "attack", params: { target: m[1] } };
  if ((m = s.match(/^hunt\s+(.+)$/))) return { action: "hunt", params: { mob: m[1] } };
  return null;
}

function parseCommand(text) {
  const original = normalize(text);
  if (!original) return null;
  const lower = original.toLowerCase();

  let target = "ALL";
  let rest = lower;

  const m = lower.match(/^(soilder|soldier)_([1-5])\s+(.+)$/);
  if (m) {
    target = "Soldier_" + m[2];
    rest = m[3];
  } else if (/^(soilder|soldier)_([1-5])$/.test(lower)) {
    return { raw: original, target: "Soldier_" + lower.match(/_([1-5])$/)[1], action: "status", params: {} };
  }

  const parsed = parseAction(rest);
  if (!parsed) return null;
  return { raw: original, target, action: parsed.action, params: parsed.params || {} };
}

function helpText() {
  return [
    "=== BOT ARMY COMMANDS ===",
    "FORMATION: follow, guard, guard <player>, defend me, come, patrol, regroup, scatter, lineup",
    "SURVIVAL: heal, gear up, set respawn nearby",
    "ITEMS: give me food, give me stuff",
    "BUILDING: build around me",
    "COLLECTION: collect <block> (e.g. collect diamonds)",
    "MOVEMENT: go to <x> <y> <z>",
    "COMBAT: attack <player>, kill all, hunt <mob>",
    "UTILITY: give coordinates, status, stop, help",
    "INDIVIDUAL: soldier_1 <command> (also Soldier_1 / SOLDIER_1 / soilder_1)",
  ].join(" | ");
}

module.exports = { parseCommand, parseAction, helpText, BOT_NAMES };