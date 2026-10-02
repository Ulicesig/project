(function (root) {
  const calculations = typeof module === 'object' && module.exports
    ? require('./calculations.js')
    : root.BuzzdCalculations;
  const tests = [];
  const test = (name, run) => tests.push({ name, run });
  const assert = (condition, message) => {
    if (!condition) throw new Error(message || 'Assertion failed.');
  };
  const equal = (actual, expected, message) => {
    assert(Object.is(actual, expected), message || `Expected ${expected}, got ${actual}.`);
  };
  const approximately = (actual, expected, tolerance = 0.01) => {
    assert(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}.`);
  };
  const throwsRangeError = callback => {
    let threw = false;
    try { callback(); } catch (error) { threw = error instanceof RangeError; }
    assert(threw, 'Expected a RangeError.');
  };
  const drink = (overrides = {}) => ({
    name: 'Test beer',
    category: 'Beer',
    volume: 12,
    abv: 5,
    loggedAt: '2026-10-01T20:00:00.000Z',
    groupId: 'group-1',
    ...overrides
  });

  test('standard drink conversion covers beer, wine, and liquor', () => {
    approximately(calculations.calculateStandardDrinks(12, 5), 1);
    approximately(calculations.calculateStandardDrinks(5, 12), 1);
    approximately(calculations.calculateStandardDrinks(1.5, 40), 1);
  });

  test('multiple drinks sum their standard-drink values', () => {
    const drinks = [
      ...calculations.createDrinkEntries(drink(), 2, drink().loggedAt, 'beer-batch'),
      ...calculations.createDrinkEntries(drink({ name: 'Wine', category: 'Wine', volume: 5, abv: 12 }), 1, '2026-10-01T21:00:00.000Z', 'wine-batch')
    ];
    equal(drinks.length, 3);
    approximately(calculations.calculateTotalStandardDrinks(drinks), 3);
  });

  test('deleting one drink leaves the other entries and totals intact', () => {
    const drinks = calculations.createDrinkEntries(drink(), 3, drink().loggedAt, 'beer-batch');
    const remaining = calculations.removeDrinkAt(drinks, 1);
    equal(remaining.length, 2);
    approximately(calculations.calculateTotalStandardDrinks(remaining), 2);
    equal(drinks.length, 3);
  });

  test('quantity creates individual records in one group', () => {
    const drinks = calculations.createDrinkEntries(drink(), 3, drink().loggedAt, 'quantity-batch');
    equal(drinks.length, 3);
    assert(drinks.every(entry => entry.groupId === 'quantity-batch'));
    approximately(calculations.calculateTotalStandardDrinks(drinks), 3);
  });

  test('custom drinks use entered ounces and ABV', () => {
    const custom = calculations.createDrinkEntries(drink({ name: 'Custom drink', category: 'Custom', volume: 2, abv: 20 }), 1, drink().loggedAt, 'custom-batch');
    equal(custom[0].name, 'Custom drink');
    approximately(custom[0].units, 2 / 3, 0.001);
  });

  test('elapsed time uses the earliest active drink', () => {
    const drinks = [
      drink({ loggedAt: '2026-10-01T11:00:00.000Z' }),
      drink({ loggedAt: '2026-10-01T10:00:00.000Z' })
    ];
    approximately(calculations.calculateElapsedHoursFromFirstDrink(drinks, '2026-10-01T12:30:00.000Z'), 2.5);
  });

  test('empty sessions have zero drink totals and pace', () => {
    const session = calculations.createSession('2026-10-01T10:00:00.000Z');
    const summary = calculations.calculateSessionSummary(session, '2026-10-01T11:30:00.000Z');
    equal(summary.drinkCount, 0);
    equal(summary.firstDrinkAt, null);
    equal(summary.mostRecentDrinkAt, null);
    equal(summary.totalStandardDrinks, 0);
    equal(summary.averagePace, 0);
    equal(calculations.calculateElapsedHoursFromFirstDrink([], '2026-10-01T11:30:00.000Z'), 0);
    equal(calculations.calculateEstimatedBac([], 150, '2026-10-01T11:30:00.000Z'), 0);
  });

  test('invalid ABV values are rejected', () => {
    [0, -1, 100.1, NaN, 'not a number'].forEach(abv => {
      throwsRangeError(() => calculations.calculateStandardDrinks(12, abv));
    });
  });

  test('invalid ounce values are rejected', () => {
    [0, -1, 100.1, NaN, 'not a number'].forEach(volume => {
      throwsRangeError(() => calculations.calculateStandardDrinks(volume, 5));
    });
  });

  test('group deletion removes all entries in the selected group only', () => {
    const drinks = [
      ...calculations.createDrinkEntries(drink(), 2, drink().loggedAt, 'group-a'),
      ...calculations.createDrinkEntries(drink({ name: 'Wine', category: 'Wine', volume: 5, abv: 12 }), 1, drink().loggedAt, 'group-b')
    ];
    const remaining = calculations.removeDrinkGroup(drinks, 'group-a');
    equal(remaining.length, 1);
    equal(remaining[0].groupId, 'group-b');
  });

  test('session reset archives history and starts a fresh session', () => {
    const session = calculations.createSession('2026-10-01T10:00:00.000Z');
    session.drinks = calculations.createDrinkEntries(drink(), 2, drink().loggedAt, 'reset-batch');
    session.waterLogs = [{ loggedAt: '2026-10-01T10:30:00.000Z' }];
    session.isPaused = true;
    session.ridePlan = { option: 'taxi-rideshare', plannedAt: '2026-10-01T10:40:00.000Z' };
    const reset = calculations.resetSession(session, '2026-10-01T11:00:00.000Z');
    equal(reset.endedSession.endedAt, '2026-10-01T11:00:00.000Z');
    equal(reset.endedSession.drinks.length, 2);
    equal(reset.endedSession.waterLogs.length, 1);
    equal(reset.currentSession.startedAt, '2026-10-01T11:00:00.000Z');
    equal(reset.currentSession.drinks.length, 0);
    equal(reset.currentSession.waterLogs.length, 0);
    equal(reset.currentSession.isPaused, false);
    equal(reset.currentSession.ridePlan, null);
    equal(session.drinks.length, 2);
  });

  test('average pace is based on total standard drinks per elapsed hour', () => {
    approximately(calculations.calculateAveragePace(3, 90 * 60 * 1000), 2);
    equal(calculations.calculateAveragePace(3, 0), 0);
  });

  const results = tests.map(({ name, run }) => {
    try {
      run();
      return { name, pass: true };
    } catch (error) {
      return { name, pass: false, error: error.message };
    }
  });
  root.BuzzdCalculationTestResults = results;
  const failures = results.filter(result => !result.pass);
  if (typeof module === 'object' && module.exports) {
    results.forEach(result => console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`));
    console.log(`${results.length - failures.length}/${results.length} calculation tests passed.`);
    if (failures.length) process.exitCode = 1;
  }
})(typeof globalThis === 'undefined' ? this : globalThis);
