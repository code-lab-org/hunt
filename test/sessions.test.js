const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, next, ask, sleep, signInAdmin, signInPlayer } = require('./helpers');

let app, admin, players;
before(async () => {
  app = await startServer();
  admin = (await signInAdmin(app)).socket;
  admin.on('players-updated', (data) => { players = data.users; });
});
after(() => app.close());

const player = (name) => players.find((p) => p.user === name);

test('signing in on a stale tab leaves the session that replaced it alone', async () => {
  const stale = await signInPlayer(app, 'alice');
  const live = await app.connect();
  const replaced = next(stale.socket, 'session-replaced');
  await ask(live, 'resume', { user: 'alice', token: stale.auth.token }, 'login-auth');
  await replaced;
  await ask(stale.socket, 'login-submit', { user: 'zed', passcode: 'wrong' }, 'login-auth');
  await sleep(100);
  assert.strictEqual(player('alice').connected, true, 'alice is still playing in the live tab');
  live.emit('strategy-select', { strategy: 'stag', design: 'A' });
  await sleep(100);
  const result = next(live, 'score-updated');
  admin.emit('score-game');
  assert.strictEqual((await result).strategy, 'stag', 'the live tab still plays');
});

test('a socket that gave up a name cannot remove whoever takes it next', async () => {
  const first = await signInPlayer(app, 'bob');
  await ask(first.socket, 'login-submit', { user: 'bob', passcode: 'wrong' }, 'login-auth');
  const second = await signInPlayer(app, 'bob');
  assert.ok(second.auth.success, 'the name was freed');
  await ask(first.socket, 'login-submit', { user: 'x', passcode: 'wrong' }, 'login-auth');
  await sleep(100);
  assert.strictEqual(player('bob').connected, true, 'the new bob is still playing');
});

test('resuming as another player holds the first one instead of orphaning them', async () => {
  const carol = await signInPlayer(app, 'carol');
  const dave = await signInPlayer(app, 'dave');
  await ask(carol.socket, 'resume', { user: 'dave', token: dave.auth.token }, 'login-auth');
  await sleep(100);
  assert.strictEqual(player('carol').connected, false, 'carol is held, not left attached');
  carol.socket.disconnect();
  await sleep(100);
  assert.strictEqual(player('dave').connected, false, 'dave is held when the socket closes');
  const back = await app.connect();
  assert.ok((await ask(back, 'resume', { user: 'carol', token: carol.auth.token }, 'login-auth')).success);
});

test('names that match object internals are ordinary names', async () => {
  const names = ['undefined', 'null', 'hasOwnProperty', '__proto__', 'constructor', 'toString'];
  const signedIn = {};
  for (const name of names) {
    const { socket, auth } = await signInPlayer(app, name);
    assert.ok(auth.success, name);
    signedIn[name] = socket;
    socket.emit('strategy-select', { strategy: 'stag', design: 'A' });
  }
  // a new socket's first sign-in has no earlier player to remove
  const fresh = await app.connect();
  await ask(fresh, 'login-submit', { user: 'u', passcode: 'wrong' }, 'login-auth');
  await sleep(100);
  for (const name of names) {
    assert.strictEqual(player(name) && player(name).connected, true, name);
  }
  // a player named "null" is not the partner of everyone who has none
  admin.emit('setup-partners', { mode: 'random' });
  admin.emit('setup-payoffs', { probCollab: 0 });
  await sleep(100);
  const result = next(signedIn.toString, 'score-updated');
  admin.emit('score-game');
  assert.strictEqual((await result).partnerStrategy, 'hare', 'the robot never hunts stag');
});

test('malformed payloads are ignored without stopping the server', async () => {
  const weird = { toString: 1, valueOf: 1 };
  const stranger = await app.connect();
  for (const data of [null, undefined, 'text', { hasOwnProperty: 1 }, { user: weird, passcode: 'attila' }, { user: 'x', passcode: weird }]) {
    assert.strictEqual((await ask(stranger, 'login-submit', data, 'login-auth')).message, 'Invalid request');
  }
  for (const data of [null, { hasOwnProperty: 1 }, { password: weird }]) {
    assert.strictEqual((await ask(stranger, 'login-admin', data, 'login-auth')).message, 'Invalid request');
  }
  for (const data of [null, { user: weird, token: weird }]) {
    await ask(stranger, 'resume', data, 'resume-failed');
  }
  await ask(stranger, 'resume-admin', null, 'resume-failed');
  const { socket } = await signInPlayer(app, 'erin');
  for (const data of [null, { hasOwnProperty: 1 }]) {
    socket.emit('strategy-select', data);
  }
  for (const data of [null, { hasOwnProperty: 1 }, { payoffs: null }, { payoffs: { A: null } },
      { payoffs: [[weird, 0], [3, 2]] }, { probCollab: weird }]) {
    admin.emit('setup-payoffs', data);
  }
  admin.emit('setup-partners', null);
  admin.emit('setup-partners', { hasOwnProperty: 1 });
  admin.emit('countdown', null);
  admin.emit('countdown', { remaining: weird });
  await sleep(200);
  assert.ok((await signInPlayer(app, 'frank')).auth.success, 'the server is still running');
});
