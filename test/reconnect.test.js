const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, next, ask, collect, sleep, signInAdmin, signInPlayer } = require('./helpers');

let app, admin, adminToken, alice, bob, bobToken, players, adminRound;
before(async () => {
  app = await startServer({ HUNT_RECONNECT_SECONDS: '1' });
  const signedIn = await signInAdmin(app);
  admin = signedIn.socket;
  adminToken = signedIn.auth.token;
  admin.on('players-updated', (data) => { players = data.users; });
  admin.on('score-updated', (data) => { adminRound = data; });
  alice = (await signInPlayer(app, 'alice')).socket;
  const b = await signInPlayer(app, 'bob');
  bob = b.socket;
  bobToken = b.auth.token;
  admin.emit('setup-partners', { mode: 'paired' });
  alice.emit('strategy-select', { strategy: 'stag', design: 'A' });
  bob.emit('strategy-select', { strategy: 'stag', design: 'A' });
  await sleep(100);
  const scored = next(alice, 'score-updated');
  admin.emit('score-game');
  await scored;
});
after(() => app.close());

const player = (name) => players.find((p) => p.user === name);

test('the admin countdown is relayed to players with the next round number', async () => {
  const countdown = next(alice, 'round-countdown');
  admin.emit('countdown', { remaining: 3000 });
  const c = await countdown;
  assert.strictEqual(c.round, 2);
  assert.ok(c.remaining > 2500 && c.remaining <= 3000);
});

test('a dropped player is held, sits out, and their partner plays a robot', async () => {
  bob.disconnect();
  await sleep(150);
  assert.strictEqual(player('bob').connected, false);
  assert.strictEqual(player('bob').score, 4, 'score kept');
  const result = next(alice, 'score-updated');
  admin.emit('score-game');
  const r = await result;
  await sleep(100);
  assert.strictEqual(r.partnerLabel, '<Random Robot>');
  assert.deepStrictEqual(adminRound.users.map((u) => u.user), ['alice'], 'bob sits out');
  const taken = await signInPlayer(app, 'bob');
  assert.strictEqual(taken.auth.message, 'User name in use', 'name stays reserved');
});

test('resuming needs the right token and restores score, choice, history and countdown', async () => {
  const socket = await app.connect();
  await ask(socket, 'resume', { user: 'bob', token: 'wrong' }, 'resume-failed');
  const history = next(socket, 'score-history');
  const countdown = next(socket, 'round-countdown');
  const auth = await ask(socket, 'resume', { user: 'bob', token: bobToken }, 'login-auth');
  assert.ok(auth.success);
  assert.strictEqual(auth.score, 4);
  assert.deepStrictEqual([auth.strategy, auth.design], ['stag', 'A']);
  assert.deepStrictEqual((await history).history.map((h) => h.round), [1]);
  assert.strictEqual((await countdown).round, null, 'scoring cleared the countdown');
  await sleep(100);
  assert.strictEqual(player('bob').connected, true);
  bob = socket;
});

test('a newer tab takes over the session; the old one is ignored', async () => {
  const newer = await app.connect();
  const replaced = next(bob, 'session-replaced');
  await ask(newer, 'resume', { user: 'bob', token: bobToken }, 'login-auth');
  await replaced;
  bob.emit('strategy-select', { strategy: 'hare', design: 'D' });
  await sleep(100);
  const result = next(newer, 'score-updated');
  admin.emit('score-game');
  assert.strictEqual((await result).strategy, 'stag', 'stale tab could not change the choice');
  bob.disconnect();
  await sleep(150);
  assert.strictEqual(player('bob').connected, true, 'closing the stale tab does not mark bob away');
  bob = newer;
});

test('history replay includes resets', async () => {
  admin.emit('reset-game');
  await sleep(100);
  const socket = await app.connect();
  const history = next(socket, 'score-history');
  await ask(socket, 'resume', { user: 'bob', token: bobToken }, 'login-auth');
  assert.deepStrictEqual((await history).history.map((h) => h.reset ? 'reset' : h.round), [1, 3, 'reset']);
  bob = socket;
});

test('after the grace period a dropped player is removed', async () => {
  bob.disconnect();
  await sleep(1400);
  assert.deepStrictEqual(players.map((p) => p.user), ['alice']);
  const socket = await app.connect();
  await ask(socket, 'resume', { user: 'bob', token: bobToken }, 'resume-failed');
});

test('the admin page resumes with its token, and a newer page takes over', async () => {
  const socket = await app.connect();
  await ask(socket, 'resume-admin', { token: 'wrong' }, 'resume-failed');
  const history = next(socket, 'game-history');
  const replaced = next(admin, 'session-replaced');
  assert.ok((await ask(socket, 'resume-admin', { token: adminToken }, 'login-auth')).success);
  await replaced;
  assert.ok(Array.isArray((await history).rounds));
  admin = socket;
});

test('the admin leaving cancels the players\' countdown', async () => {
  admin.emit('countdown', { remaining: 5000 });
  await next(alice, 'round-countdown');
  const cancel = next(alice, 'round-countdown');
  admin.disconnect();
  assert.strictEqual((await cancel).round, null);
  // and nothing else arrives afterwards
  assert.deepStrictEqual(await collect(alice, 'round-countdown', 200), []);
});
