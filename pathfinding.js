const { Movements, goals } = require("mineflayer-pathfinder");

// Fast, aggressive movement profile so bots sprint and don't hesitate.
function setupMovements(bot) {
  const movements = new Movements(bot);

  // Sprinting — the biggest speed win.
  movements.allowSprinting = true;
  movements.allowParkour = true;        // jump gaps / climb
  movements.allowEntitySprinting = true;

  // Don't waste time mining/breaking blocks unless needed.
  movements.canDig = false;
  movements.canOpenDoors = true;

  // Don't avoid anything — go straight.
  movements.dontCreateFlow = false;
  movements.dontMineAtAll = true;

  // Jump into water / fall — keep moving.
  movements.allow1by1towers = false;
  movements.infiniteLiquidDropdownDistance = true;

  // Speed: how often the bot can recompute (higher = snappier).
  movements.PLACE_COST = 100;
  movements.DIG_COST = 100;

  bot.pathfinder.setMovements(movements);
  bot._legionMovements = movements;
  return movements;
}

module.exports = { setupMovements, goals };