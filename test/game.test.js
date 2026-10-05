const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, next, ask, sleep, signInAdmin, signInPlayer } = require('./helpers');

let app, admin, alice, bob, players;
before(async () => {
  app = await startServer();
  admin = (await signInAdmin(app)).socket;
  admin.on('players-updated', (data) => { players = data.users; });
});
after(() => app.close());

test('players sign in with the pass code and a unique name', async () => {
  const socket = await app.connect();
  assert.strictEqual((await ask(socket, 'login-submit', { user: 'alice', passcode: 'wrong' }, 'login-auth')).message, 'Incorrect pass code');
  const auth = await ask(socket, 'login-submit', { user: 'alice', passcode: 'attila' }, 'login-auth');
  assert.ok(auth.success);
  assert.strictEqual(auth.strategy, 'hare', 'players start on hare');
  alice = socket;
  const duplicate = await signInPlayer(app, 'alice');
  assert.strictEqual(duplicate.auth.message, 'User name in use');
  const escaped = await signInPlayer(app, '<bob>');
  assert.strictEqual(escaped.auth.user, '&lt;bob&gt;', 'names are HTML-escaped');
  bob = escaped.socket;
});

test('profane names are refused, without catching innocent ones', async () => {
  for (const name of ['fuck', 'Sh1tHead', 'f.u.c.k', 's h i t']) {
    const { socket, auth } = await signInPlayer(app, name);
    assert.strictEqual(auth.message, 'Please choose a different name', name);
    socket.disconnect();
  }
  for (const name of ['Scunthorpe', 'Cassandra', 'Dickens', 'J. R. R.']) {
    const { socket, auth } = await signInPlayer(app, name);
    assert.ok(auth.success, name);
    socket.disconnect();
  }
  await sleep(100);
});

test('the admin sees players as they join', async () => {
  await sleep(100);
  // (players from the name-filter test have left and are held as reconnecting)
  assert.deepStrictEqual(players.filter((p) => p.connected).map((p) => p.user).sort(), ['&lt;bob&gt;', 'alice']);
});

test('only the signed-in admin can sign in as admin', async () => {
  const socket = await app.connect();
  assert.strictEqual((await ask(socket, 'login-admin', { password: 'wrong' }, 'login-auth')).message, 'Incorrect password');
  assert.strictEqual((await ask(socket, 'login-admin', { password: 'admin' }, 'login-auth')).message, 'Already logged in');
});

test('paired players score from each other\'s choices', async () => {
  const partner = next(alice, 'partner-updated');
  admin.emit('setup-partners', { mode: 'paired' });
  assert.strictEqual((await partner).partnerLabel, '&lt;bob&gt;');
  alice.emit('strategy-select', { strategy: 'stag', design: 'A' });
  bob.emit('strategy-select', { strategy: 'hare', design: 'D' });
  await sleep(100);
  const aliceResult = next(alice, 'score-updated');
  const bobResult = next(bob, 'score-updated');
  const summary = next(admin, 'score-updated');
  admin.emit('score-game');
  assert.deepStrictEqual(await aliceResult, {
    round: 1, score: 0, delta: 0, strategy: 'stag', design: null, partnerStrategy: 'hare', partnerLabel: '&lt;bob&gt;'
  });
  assert.strictEqual((await bobResult).delta, 3);
  assert.deepStrictEqual((await summary).users.map((u) => [u.user, u.score]), [['&lt;bob&gt;', 3], ['alice', 0]]);
});

test('complex payoffs depend on the tool chosen', async () => {
  const payoffs = { A: [[4, 0], [0, 0]], B: [[3.5, 1.5], [1, 1]], C: [[3.25, 0.25], [1, 1]], D: [[0, 0], [3, 2]] };
  const changed = next(alice, 'payoffs-changed');
  admin.emit('setup-payoffs', { payoffs });
  assert.deepStrictEqual((await changed).payoffs, payoffs);
  alice.emit('strategy-select', { strategy: 'stag', design: 'B' });
  await sleep(100);
  const result = next(alice, 'score-updated');
  admin.emit('score-game');
  const r = await result;
  assert.strictEqual(r.round, 2);
  assert.strictEqual(r.design, 'B');
  assert.strictEqual(r.delta, 1.5, 'Bow: stag against hare');
});

test('invalid payoffs and probabilities are ignored', async () => {
  const changed = next(alice, 'payoffs-changed');
  admin.emit('setup-payoffs', { payoffs: [['x', 0], [3, 2]], probCollab: 5 });
  assert.strictEqual((await changed).payoffs.B[0][1], 1.5, 'previous payoffs kept');
});

test('reset sets scores to zero and restarts round numbers', async () => {
  const reset = next(alice, 'score-reset');
  admin.emit('reset-game');
  await reset;
  await sleep(100);
  assert.ok(players.every((p) => p.score === 0));
  const result = next(alice, 'score-updated');
  admin.emit('score-game');
  assert.strictEqual((await result).round, 1);
});
