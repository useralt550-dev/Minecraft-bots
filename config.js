const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = path.join(__dirname, "settings.json");
let settings = null;

function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch (e) {
    settings = {};
  }
  return settings;
}

function getSettings() {
  if (!settings) loadSettings();
  return settings;
}

function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  settings = next;
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  } catch (e) {
    // read-only environments: keep in-memory
  }
  return next;
}

module.exports = { loadSettings, getSettings, saveSettings };