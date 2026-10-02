(function (root, factory) {
  const calculations = factory();
  if (typeof module === 'object' && module.exports) module.exports = calculations;
  if (root) root.BuzzdCalculations = calculations;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';

  const STANDARD_DRINK_ETHANOL_OZ = 0.6;

  function validateDrinkInput(volumeOz, abvPercent) {
    const volume = Number(volumeOz);
    const abv = Number(abvPercent);
    if (!Number.isFinite(volume) || volume <= 0 || volume > 100) {
      throw new RangeError('Volume must be greater than 0 and no more than 100 oz.');
    }
    if (!Number.isFinite(abv) || abv <= 0 || abv > 100) {
      throw new RangeError('ABV must be greater than 0 and no more than 100%.');
    }
    return { volume, abv };
  }

  function calculateStandardDrinks(volumeOz, abvPercent) {
    const { volume, abv } = validateDrinkInput(volumeOz, abvPercent);
    return (volume * abv / 100) / STANDARD_DRINK_ETHANOL_OZ;
  }

  function createDrinkEntries(drink, quantity, loggedAt, groupId) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new RangeError('Quantity must be an integer between 1 and 20.');
    }
    if (!drink || typeof drink.name !== 'string' || !drink.name.trim()) {
      throw new TypeError('A drink name is required.');
    }
    if (typeof groupId !== 'string' || !groupId.trim()) {
      throw new TypeError('A drink group ID is required.');
    }
    const { volume, abv } = validateDrinkInput(drink.volume, drink.abv);
    const timestamp = new Date(loggedAt);
    if (Number.isNaN(timestamp.getTime())) {
      throw new RangeError('A valid drink timestamp is required.');
    }
    const entry = {
      ...drink,
      volume,
      abv,
      loggedAt: timestamp.toISOString(),
      groupId,
      units: calculateStandardDrinks(volume, abv)
    };
    return Array.from({ length: quantity }, () => ({ ...entry }));
  }

  function calculateTotalStandardDrinks(drinks) {
    return drinks.reduce((total, drink) => total + drink.units, 0);
  }

  function calculateSessionMetrics(drinks) {
    const totalStandardDrinks = calculateTotalStandardDrinks(drinks);
    const averageAbv = drinks.length
      ? drinks.reduce((total, drink) => total + drink.abv, 0) / drinks.length
      : 0;
    return {
      drinkCount: drinks.length,
      totalStandardDrinks,
      averageAbv,
      drinkTypeCount: new Set(drinks.map(drink => drink.category)).size
    };
  }

  function groupDrinks(drinks) {
    const groups = new Map();
    drinks.forEach((drink, index) => {
      const groupId = drink.groupId ?? `single-${index}`;
      let group = groups.get(groupId);
      if (!group) {
        group = { ...drink, groupId, quantity: 0, totalUnits: 0 };
        groups.set(groupId, group);
      }
      group.quantity += 1;
      group.totalUnits += drink.units;
    });
    return [...groups.values()];
  }

  function removeDrinkAt(drinks, index) {
    if (!Number.isInteger(index) || index < 0 || index >= drinks.length) return [...drinks];
    return drinks.filter((drink, drinkIndex) => drinkIndex !== index);
  }

  function removeDrinkGroup(drinks, groupId) {
    return drinks.filter((drink, index) => (drink.groupId ?? `single-${index}`) !== groupId);
  }

  function toTimestamp(value) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function calculateElapsedHoursFromFirstDrink(drinks, now = Date.now()) {
    const timestamps = drinks.map(drink => toTimestamp(drink.loggedAt)).filter(timestamp => timestamp !== null);
    if (!timestamps.length) return 0;
    const nowTimestamp = toTimestamp(now);
    if (nowTimestamp === null) throw new RangeError('A valid current time is required.');
    const earliest = Math.min(...timestamps);
    return Math.max(0, (nowTimestamp - earliest) / 3600000);
  }

  function calculateElapsedSessionMilliseconds(startedAt, now = Date.now()) {
    const startTimestamp = toTimestamp(startedAt);
    const nowTimestamp = toTimestamp(now);
    if (startTimestamp === null || nowTimestamp === null) {
      throw new RangeError('Valid session start and current times are required.');
    }
    return Math.max(0, nowTimestamp - startTimestamp);
  }

  function calculateAveragePace(totalStandardDrinks, elapsedMilliseconds) {
    const total = Number(totalStandardDrinks);
    const elapsed = Number(elapsedMilliseconds);
    if (!Number.isFinite(total) || total < 0 || !Number.isFinite(elapsed) || elapsed < 0) {
      throw new RangeError('Drink total and elapsed time must be non-negative numbers.');
    }
    const elapsedHours = elapsed / 3600000;
    return elapsedHours > 0 ? total / elapsedHours : 0;
  }

  function calculateSessionSummary(session, now = Date.now()) {
    const drinks = Array.isArray(session?.drinks) ? session.drinks : [];
    const chronologicalDrinks = [...drinks].sort((first, second) => toTimestamp(first.loggedAt) - toTimestamp(second.loggedAt));
    const elapsedMilliseconds = calculateElapsedSessionMilliseconds(session.startedAt, now);
    const totalStandardDrinks = calculateTotalStandardDrinks(drinks);
    return {
      firstDrinkAt: chronologicalDrinks[0]?.loggedAt ?? null,
      mostRecentDrinkAt: chronologicalDrinks[chronologicalDrinks.length - 1]?.loggedAt ?? null,
      elapsedMilliseconds,
      drinkCount: drinks.length,
      totalStandardDrinks,
      averagePace: calculateAveragePace(totalStandardDrinks, elapsedMilliseconds)
    };
  }

  function calculateEstimatedBac(drinks, bodyWeightLb, now = Date.now()) {
    const weight = Number(bodyWeightLb);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError('Body weight must be a positive number.');
    }
    const totalStandardDrinks = calculateTotalStandardDrinks(drinks);
    const elapsedHours = calculateElapsedHoursFromFirstDrink(drinks, now);
    return Math.max(0, totalStandardDrinks * 0.6 * 5.14 / (weight * 0.68) - 0.015 * elapsedHours);
  }

  function createSession(startedAt = new Date()) {
    const start = new Date(startedAt);
    if (Number.isNaN(start.getTime())) throw new RangeError('A valid session start time is required.');
    return {
      startedAt: start.toISOString(),
      endedAt: null,
      drinks: [],
      waterLogs: [],
      isPaused: false,
      pausedAt: null,
      ridePlan: null
    };
  }

  function resetSession(session, endedAt = new Date()) {
    const end = new Date(endedAt);
    if (Number.isNaN(end.getTime())) throw new RangeError('A valid session end time is required.');
    const endedAtIso = end.toISOString();
    const endedSession = {
      ...session,
      endedAt: endedAtIso,
      drinks: (session.drinks || []).map(drink => ({ ...drink })),
      waterLogs: (session.waterLogs || []).map(log => ({ ...log })),
      ridePlan: session.ridePlan ? { ...session.ridePlan } : null
    };
    return { endedSession, currentSession: createSession(end) };
  }

  return {
    calculateStandardDrinks,
    validateDrinkInput,
    createDrinkEntries,
    calculateTotalStandardDrinks,
    calculateSessionMetrics,
    groupDrinks,
    removeDrinkAt,
    removeDrinkGroup,
    calculateElapsedHoursFromFirstDrink,
    calculateElapsedSessionMilliseconds,
    calculateAveragePace,
    calculateSessionSummary,
    calculateEstimatedBac,
    createSession,
    resetSession
  };
});
