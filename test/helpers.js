/**
 * Test helpers: start the app on a free port and talk to it the way the
 * player and admin pages do.
 */

const { io } = require('socket.io-client');

// Start the server; env is applied first because the app reads it when loaded.
// Each test file runs in its own process, so each gets a fresh game.
function startServer(env = {}) {
  Object.assign(process.env, env);
  const { server, io: ioServer } = require('../app');
  return new Promise((resolve) => {
    server.listen(0, () => {
      const base = 'http://localhost:' + server.address().port;
      const sockets = [];
      resolve({
        base,
        // a new client connection (no automatic reconnection, so tests control it)
        connect(options = {}) {
          return new Promise((res, rej) => {
            const socket = io(base, { transports: ['websocket'], forceNew: true, reconnection: false, ...options });
            sockets.push(socket);
            socket.once('connect', () => res(socket));
            socket.once('connect_error', rej);
          });
        },
        close() {
          sockets.forEach((socket) => socket.disconnect());
          return new Promise((res) => ioServer.close(() => res()));
        }
      });
    });
  });
}

// resolve with the next event of this name
function next(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

// emit an event and resolve with the reply event
function ask(socket, event, data, reply) {
  const answer = next(socket, reply);
  socket.emit(event, data);
  return answer;
}

// resolve with every event of this name received during the next ms milliseconds
function collect(socket, event, ms) {
  const seen = [];
  const listener = (data) => seen.push(data);
  socket.on(event, listener);
  return new Promise((resolve) => setTimeout(() => {
    socket.off(event, listener);
    resolve(seen);
  }, ms));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signInAdmin(app, password = 'admin') {
  const socket = await app.connect();
  const auth = await ask(socket, 'login-admin', { password }, 'login-auth');
  return { socket, auth };
}

async function signInPlayer(app, user, passcode = 'attila') {
  const socket = await app.connect();
  const auth = await ask(socket, 'login-submit', { user, passcode }, 'login-auth');
  return { socket, auth };
}

module.exports = { startServer, next, ask, collect, sleep, signInAdmin, signInPlayer };
