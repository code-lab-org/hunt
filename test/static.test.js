const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');

let app;
before(async () => { app = await startServer(); });
after(() => app.close());

test('serves the pages and every script and stylesheet they load', async () => {
  // the browser libraries are installed into public/scripts by npm's postinstall step
  const paths = [
    '/', '/admin.html', '/stylesheets/style.css', '/javascripts/client.js', '/javascripts/admin.js',
    '/scripts/bootstrap/dist/css/bootstrap.min.css', '/scripts/bootstrap/dist/js/bootstrap.bundle.min.js',
    '/scripts/jquery/dist/jquery.min.js', '/scripts/jquery/dist/jquery.slim.min.js',
    '/scripts/chart.js/dist/chart.umd.min.js', '/scripts/socket.io-client/dist/socket.io.js',
    '/socket.io/socket.io.js'
  ];
  for (const path of paths) {
    const response = await fetch(app.base + path);
    assert.strictEqual(response.status, 200, path);
  }
});

test('returns 404 for unknown paths', async () => {
  assert.strictEqual((await fetch(app.base + '/nope')).status, 404);
});
