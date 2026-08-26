const { BOT_NAMES } = require("./state");
const { getSettings } = require("./config");

function isProtected(name) {
  if (!name) return false;
  const n = String(name).toLowerCase().trim();
  const owner = String(getSettings().owner || "").toLowerCase().trim();
  if (n === owner) return true;
  if (BOT_NAMES.map((b) => b.toLowerCase()).includes(n)) return true;
  return false;
}

module.exports = { isProtected };