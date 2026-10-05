const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, next, ask, collect, sleep, signInAdmin, signInPlayer } = require('./helpers');

let app, admin, adminToken, alice, bob;
before(async () => {
  app = await startServer();
  const signedIn = await signInAdmin(app);
  admin = signedIn.socket;
  adminToken = signedIn.auth.token;
  alice = (await signInPlayer(app, 'alice')).socket;
  bob = (await signInPlayer(app, '=cmd|"x"')).socket;
});
after(() => app.close());

test('players and unauthenticated connections cannot run admin actions', async () => {
  const stranger = await app.connect();
  const events = ['score-updated', 'score-reset', 'payoffs-changed', 'partner-updated', 'round-countdown'];
  const watched = events.map((event) => collect(alice, event, 400));
  for (const socket of [alice, stranger]) {
    socket.emit('score-game');
    socket.emit('reset-game');
    socket.emit('setup-payoffs', { payoffs: [[100, 100], [100, 100]], probCollab: 1 });
    socket.emit('setup-partners', { mode: 'paired' });
    socket.emit('countdown', { remaining: 5000 });
    socket.emit('export-results');
  }
  const seen = await Promise.all(watched);
  assert.deepStrictEqual(seen.map((s) => s.length), [0, 0, 0, 0, 0], 'no game changes');
  assert.deepStrictEqual(await collect(stranger, 'export-results', 100), [], 'no results for non-admins');
});

test('a signed-in admin page gets the game history and current settings', async () => {
  admin.emit('setup-partners', { mode: 'hidden' });
  alice.emit('strategy-select', { strategy: 'stag', design: 'A' });
  await sleep(100);
  for (let i = 0; i < 2; i++) {
    const scored = next(admin, 'score-updated');
    admin.emit('score-game');
    await scored;
  }
  const page = await app.connect();
  const payoffs = next(page, 'payoffs-changed');
  const partners = next(page, 'partners-changed');
  const history = next(page, 'game-history');
  await ask(page, 'resume-admin', { token: adminToken }, 'login-auth');
  assert.deepStrictEqual((await payoffs).payoffs, [[4, 0], [3, 2]]);
  assert.strictEqual((await partners).mode, 'hidden');
  const rounds = (await history).rounds;
  assert.deepStrictEqual(rounds.map((r) => r.round), [1, 2]);
  assert.deepStrictEqual(rounds[0].users.map((u) => u.user).sort(), ['=cmd|&quot;x&quot;', 'alice']);
  admin = page;
});

test('results export as CSV across games, with names made safe for spreadsheets', async () => {
  const reset = next(alice, 'score-reset');
  admin.emit('reset-game');
  await reset;
  const scored = next(admin, 'score-updated');
  admin.emit('score-game');
  await scored;
  const csv = (await ask(admin, 'export-results', undefined, 'export-results')).csv;
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines[0], 'game,round,time,mode,player_id,player,strategy,tool,partner_id,partner,partner_strategy,points,total');
  assert.strictEqual(lines.length, 1 + 6, 'two players in rounds 1-2 of game 1 and round 1 of game 2');
  const rows = lines.slice(1).map((line) => line.split(','));
  assert.deepStrictEqual(rows.map((r) => r[0] + '.' + r[1]), ['1.1', '1.1', '1.2', '1.2', '2.1', '2.1']);
  const aliceRow = lines.find((line) => line.includes(',alice,'));
  assert.ok(aliceRow.startsWith('1,1,'), 'game 1, round 1');
  assert.ok(aliceRow.includes(',simple,'), 'payoff mode');
  assert.ok(aliceRow.includes(',alice,stag,,'), 'player, strategy, no tool in simple mode');
  // the other player's name starts with "=", so it is prefixed to stop formula evaluation, then quoted
  assert.ok(csv.includes(`"'=cmd|""x"""`), 'formula-like name is neutralized and quoted');
  // hidden pairing still records the real partner for analysis
  assert.ok(aliceRow.includes(`,"'=cmd|""x""",`), 'partner recorded');
});

test('repeated wrong admin passwords block sign-in from that address', async () => {
  const socket = await app.connect();
  for (let i = 0; i < 5; i++) {
    assert.strictEqual((await ask(socket, 'login-admin', { password: 'guess' + i }, 'login-auth')).message, 'Incorrect password');
  }
  const blocked = await ask(socket, 'login-admin', { password: 'admin' }, 'login-auth');
  assert.match(blocked.message, /^Too many attempts\. Try again in \d+ seconds\.$/, 'even the right password is refused');
});
