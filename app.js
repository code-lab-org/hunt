/**
 * Server application.
 *
 * Performs back-end operations.
 *
 * @author Paul T. Grogan <pgrogan@stevens.edu>.
 * @since  0.0.0
 */

var express = require('express');
var path = require('path');
var logger = require('morgan');

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var hunt = require('./hunt')(io);

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));

module.exports = {app: app, server: server, io: io};
