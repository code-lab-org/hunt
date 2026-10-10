var crypto = require('crypto');
var validator = require('validator');
var { RegExpMatcher, englishDataset, englishRecommendedTransformers } = require('obscenity');

// basic profanity filter for user names; the recommended transformers catch
// look-alike spellings (e.g. "sh1t") without flagging words like "Scunthorpe"
var profanity = new RegExpMatcher({...englishDataset.build(), ...englishRecommendedTransformers});
function isProfane(name) {
  // also catch words spelled out with separators, e.g. "f.u.c.k" or "s h i t"
  var parts = name.split(/[\s._*\-]+/).filter(Boolean);
  var spelled = parts.length > 1 && parts.every(part => part.length === 1) ? parts.join('') : null;
  return profanity.hasMatch(name) || (spelled !== null && profanity.hasMatch(spelled));
}

var maxNameLength = 32; // matches the maxlength of the sign-in form's name field

// socket payloads are untrusted: a handler sees anything that isn't an object as empty, and
// reads only numbers and strings, so values like {"toString": 1} can't throw and stop the server
function isObject(value) {
  return value !== null && typeof value === 'object';
}
function payload(data) {
  return isObject(data) ? data : {};
}
function number(value) {
  return typeof value === 'number' || typeof value === 'string' ? Number.parseFloat(value) : NaN;
}

module.exports = function(io) {
  var admin = null;
  var adminToken = null; // lets the admin page resume after a reload or dropped connection
  // keyed by user name, with no prototype so names like "__proto__" or "hasOwnProperty" are ordinary keys
  var users = Object.create(null);
  // simple mode: [SS, SH], [HS, HH]; complex mode: the same per tool, {'A': [[...], [...]], ...}
  var payoffs = [[4, 0], [3, 2]];

  var probCollab = 0.5;
  var nextUserId = 1; // unique per connection, since user names can be reused
  var round = 0; // rounds scored since the last reset
  // how long a disconnected user keeps their place and score
  var reconnectGrace = (Number(process.env.HUNT_RECONNECT_SECONDS) || 120) * 1000;
  var countdown = null; // {'endsAt'} while the admin counts down to the next round
  var partnerMode = 'random';
  var rounds = []; // admin summaries of rounds since the last reset, replayed to the admin page
  var game = 1; // increases with each reset that follows scored rounds
  var results = []; // every scored player-round since the server started, for CSV export
  var toolNames = {'A': 'Atlatl', 'B': 'Bow', 'C': 'Club', 'D': 'Dog'};

  // credentials are escaped the same way as login input so they compare equal
  var userPasscode = validator.escape(process.env.HUNT_USER_PASSCODE || 'attila');
  var adminPassword = validator.escape(process.env.HUNT_ADMIN_PASSWORD || 'admin');

  function isUser(userName) {
    return typeof userName === 'string' && Object.hasOwn(users, userName);
  }

  // whether this socket plays as the user, rather than a tab whose session moved elsewhere
  function owns(userName, socket) {
    return isUser(userName) && users[userName].socket === socket;
  }

  function send(userName, event, data) {
    // users waiting to reconnect have no socket
    if(users[userName].socket) {
      users[userName].socket.emit(event, data);
    }
  }

  function updateAdmin() {
    // every user, including those waiting to reconnect, sorted by decreasing score
    if(admin) {
      admin.emit('players-updated', {
        'users': Object.keys(users).map(
          i => ({
              'id': users[i].id,
              'user': i,
              'score': users[i].score,
              'connected': users[i].socket !== null
          })
        ).sort((a, b) => b.score - a.score || a.user.localeCompare(b.user))
      });
    }
  }

  // failed admin sign-ins by client address: {count, since, blockedUntil}
  var loginFailures = Object.create(null);
  var maxLoginFailures = 5;
  var loginFailureWindow = 60 * 1000;
  var loginLockout = 60 * 1000;
  function clientAddress(socket) {
    // behind the bundled Traefik proxy, the last X-Forwarded-For entry is the address it saw
    var forwarded = socket.handshake.headers['x-forwarded-for'];
    if(process.env.HUNT_TRUST_PROXY === 'true' && forwarded) {
      return forwarded.split(',').pop().trim();
    }
    return socket.handshake.address;
  }

  function sendAdminState(socket) {
    // restore the admin page after a sign-in, reload or reconnect
    socket.emit('payoffs-changed', {'payoffs': payoffs, 'probCollab': probCollab});
    socket.emit('partners-changed', {'mode': partnerMode});
    socket.emit('game-history', {'rounds': rounds});
  }

  var csvColumns = ['game', 'round', 'time', 'mode', 'player_id', 'player', 'strategy', 'tool',
    'partner_id', 'partner', 'partner_strategy', 'points', 'total'];
  function csvCell(value) {
    var text = String(value);
    // keep spreadsheet apps from running player names as formulas
    if(typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
  function resultsCsv() {
    return [csvColumns.join(',')].concat(
      results.map(result => csvColumns.map(column => csvCell(result[column])).join(','))
    ).join('\r\n') + '\r\n';
  }

  function countdownData() {
    return countdown
      ? {'round': round + 1, 'remaining': Math.max(0, countdown.endsAt - Date.now())}
      : {'round': null, 'remaining': 0};
  }

  function removeUser(userName) {
    // remove the user as anyone's partner
    Object.keys(users).forEach((i) => {
      if(users[i].partner === userName) {
        users[i].partner = null;
        users[i].partnerLabel = '<Random Robot>';
        send(i, 'partner-updated', { 'partnerLabel': users[i].partnerLabel });
      }
    });
    // remove this user from the application
    if(isUser(userName)) {
      clearTimeout(users[userName].removeTimer);
      console.log('User ' + userName + ' removed.');
      delete users[userName];
      updateAdmin();
    }
  }

  function holdUser(userName) {
    // hold the user's place so they can resume after a reload or dropped connection
    users[userName].socket = null;
    // unref: a pending removal alone does not keep the process running
    users[userName].removeTimer = setTimeout(() => removeUser(userName), reconnectGrace).unref();
    console.log('User ' + userName + ' disconnected; holding their place for ' + reconnectGrace / 1000 + ' s.');
    updateAdmin();
  }

  function addUser(userName, socket) {
    if(Object.keys(users).includes(userName)) {
      return false;
    } else {
      users[userName] = {
        'id': nextUserId++,
        'token': crypto.randomUUID(), // lets this user resume after a reload or dropped connection
        'socket': socket,
        'removeTimer': null,
        'partner': null,
        'partnerLabel': '<Random Robot>',
        'score': 0,
        'strategy': 'hare',
        'design': 'D',
        'history': [] // score updates and resets, replayed when the user resumes
      };
      console.log('User ' + userName + ' connected.');
      updateAdmin();
      return true;
    }
  }

  function loginData(userName) {
    return {
      'user': userName,
      'success': true,
      'token': users[userName].token,
      'score': users[userName].score,
      'strategy': users[userName].strategy,
      'design': users[userName].design
    };
  }

  io.on('connection', (socket) => {
    var user = null;

    // respond to user login attempt
    socket.on('login-submit', (data) => {
      data = payload(data);
      // sign out this socket's user, unless that session has since moved to another tab
      if(owns(user, socket)) {
        removeUser(user);
      }
      user = null;
      // authenticate unique user with master pass code
      if(typeof data.user !== 'string' || typeof data.passcode !== 'string') {
          socket.emit('login-auth', {'success': false, 'message': 'Invalid request'});
          return;
      }
      if(data.user.length > maxNameLength) {
        // names are stored and sent with every update and round; long ones could exhaust memory
        socket.emit('login-auth', {'success': false, 'message': 'Please choose a name of at most ' + maxNameLength + ' characters'});
        return;
      }
      var userInput = validator.escape(data.user);
      var passcodeInput = validator.escape(data.passcode);

      if(passcodeInput !== userPasscode) {
        socket.emit('login-auth', {'user': userInput, 'success': false, 'message': 'Incorrect pass code'});
      } else if(isProfane(data.user)) {
        socket.emit('login-auth', {'user': userInput, 'success': false, 'message': 'Please choose a different name'});
      } else {
        if(addUser(userInput, socket)) {
          user = userInput;
          socket.emit('login-auth', loginData(userInput));
          socket.emit('payoffs-changed', {'payoffs': payoffs});
          socket.emit('round-countdown', countdownData());
        } else {
          socket.emit('login-auth', {'user': userInput, 'success': false, 'message': 'User name in use'});
        }
      }
    });

    // reattach a returning user (page reload or dropped connection) within the grace period
    socket.on('resume', (data) => {
      data = payload(data);
      var userName = data.user;
      if(!isUser(userName) || typeof data.token !== 'string' || data.token !== users[userName].token) {
        socket.emit('resume-failed');
        return;
      }
      if(user !== userName && owns(user, socket)) {
        // this socket played as someone else until now; hold their place too
        holdUser(user);
      }
      if(users[userName].socket && users[userName].socket !== socket) {
        // the same session opened elsewhere (e.g. a duplicated tab); the newest one wins
        users[userName].socket.emit('session-replaced');
      }
      clearTimeout(users[userName].removeTimer);
      users[userName].socket = socket;
      user = userName;
      socket.emit('login-auth', loginData(userName));
      socket.emit('payoffs-changed', {'payoffs': payoffs});
      socket.emit('partner-updated', {'partnerLabel': users[userName].partnerLabel});
      socket.emit('score-history', {'history': users[userName].history});
      socket.emit('round-countdown', countdownData());
      console.log('User ' + userName + ' reconnected.');
      updateAdmin();
    });

    // respond to admin login attempt
    socket.on('login-admin', (data) => {
      data = payload(data);
      // authenticate single admin with master password
      if(typeof data.password !== 'string') {
          socket.emit('login-auth', {'success': false, 'message': 'Invalid request'});
          return;
      }
      var address = clientAddress(socket);
      var now = Date.now();
      var failures = loginFailures[address];
      if(failures && failures.blockedUntil > now) {
        var wait = Math.ceil((failures.blockedUntil - now) / 1000);
        socket.emit('login-auth', {'success': false, 'message': 'Too many attempts. Try again in ' + wait + ' seconds.'});
        return;
      }
      var passwordInput = validator.escape(data.password);
      if(passwordInput !== adminPassword) {
        // limit password guessing: a burst of failures blocks this address for a while
        Object.keys(loginFailures).forEach((key) => {
          if(loginFailures[key].blockedUntil < now && now - loginFailures[key].since > loginFailureWindow) {
            delete loginFailures[key];
          }
        });
        failures = loginFailures[address];
        if(!failures || now - failures.since > loginFailureWindow) {
          failures = loginFailures[address] = {'count': 0, 'since': now, 'blockedUntil': 0};
        }
        failures.count += 1;
        if(failures.count >= maxLoginFailures) {
          failures.blockedUntil = now + loginLockout;
          console.log('Admin sign-in blocked for ' + address + ' after ' + failures.count + ' failed attempts.');
        }
        socket.emit('login-auth', {'success': false, 'message': 'Incorrect password'});
      } else if(admin !== null) {
        socket.emit('login-auth', {'success': false, 'message': 'Already logged in'});
      } else {
        delete loginFailures[address];
        admin = socket;
        adminToken = crypto.randomUUID();
        socket.emit('login-auth', {'success': true, 'token': adminToken});
        console.log('Admin connected.');
        sendAdminState(socket);
        updateAdmin();
      }
    });

    // reattach the admin page (reload or dropped connection); the newest page wins
    socket.on('resume-admin', (data) => {
      data = payload(data);
      if(!adminToken || data.token !== adminToken) {
        socket.emit('resume-failed');
        return;
      }
      if(admin && admin !== socket) {
        admin.emit('session-replaced');
      }
      admin = socket;
      socket.emit('login-auth', {'success': true, 'token': adminToken});
      sendAdminState(socket);
      console.log('Admin reconnected.');
      updateAdmin();
    });

    // relay the admin's countdown to the next round so players know when choices are scored
    socket.on('countdown', (data) => {
      if(socket !== admin) {
        return;
      }
      var remaining = number(payload(data).remaining);
      countdown = remaining > 0 ? {'endsAt': Date.now() + remaining} : null;
      Object.keys(users).forEach((i) => {
        send(i, 'round-countdown', countdownData());
      });
    });

    // respond to user strategy change
    socket.on('strategy-select', (data) => {
      // ignore a stale tab whose session was resumed elsewhere
      if(!owns(user, socket)) {
        return;
      }
      data = payload(data);
      if(data.strategy === 'hare' || data.strategy === 'stag') {
        users[user].strategy = data.strategy;
      }
      if(data.design === 'A' || data.design === 'B' || data.design === 'C' || data.design === 'D') {
        users[user].design = data.design;
      }
    });

    // respond to admin changing payoffs
    socket.on('setup-payoffs', (data) => {
      // only the signed-in admin may change the game
      if(socket !== admin) {
        return;
      }
      data = payload(data);
      if(Object.hasOwn(data, 'payoffs')
          && Array.isArray(data.payoffs)
          && data.payoffs.length == 2
          && Array.isArray(data.payoffs[0])
          && data.payoffs[0].length == 2
          && !isNaN(number(data.payoffs[0][0]))
          && !isNaN(number(data.payoffs[0][1]))
          && Array.isArray(data.payoffs[1])
          && data.payoffs[1].length == 2
          && !isNaN(number(data.payoffs[1][0]))
          && !isNaN(number(data.payoffs[1][1]))) {
        payoffs = [
          [number(data.payoffs[0][0]), number(data.payoffs[0][1])],
          [number(data.payoffs[1][0]), number(data.payoffs[1][1])]
        ];
      } else if(Object.hasOwn(data, 'payoffs')
          && isObject(data.payoffs) && Object.hasOwn(data.payoffs, 'A')
          && Array.isArray(data.payoffs.A)
          && data.payoffs.A.length == 2
          && Array.isArray(data.payoffs.A[0])
          && data.payoffs.A[0].length == 2
          && !isNaN(number(data.payoffs.A[0][0]))
          && !isNaN(number(data.payoffs.A[0][1]))
          && Array.isArray(data.payoffs.A[1])
          && data.payoffs.A[1].length == 2
          && !isNaN(number(data.payoffs.A[1][0]))
          && !isNaN(number(data.payoffs.A[1][1]))
          && Object.hasOwn(data.payoffs, 'B')
          && Array.isArray(data.payoffs.B)
          && data.payoffs.B.length == 2
          && Array.isArray(data.payoffs.B[0])
          && data.payoffs.B[0].length == 2
          && !isNaN(number(data.payoffs.B[0][0]))
          && !isNaN(number(data.payoffs.B[0][1]))
          && Array.isArray(data.payoffs.B[1])
          && data.payoffs.B[1].length == 2
          && !isNaN(number(data.payoffs.B[1][0]))
          && !isNaN(number(data.payoffs.B[1][1]))
          && Object.hasOwn(data.payoffs, 'C')
          && Array.isArray(data.payoffs.C)
          && data.payoffs.C.length == 2
          && Array.isArray(data.payoffs.C[0])
          && data.payoffs.C[0].length == 2
          && !isNaN(number(data.payoffs.C[0][0]))
          && !isNaN(number(data.payoffs.C[0][1]))
          && Array.isArray(data.payoffs.C[1])
          && data.payoffs.C[1].length == 2
          && !isNaN(number(data.payoffs.C[1][0]))
          && !isNaN(number(data.payoffs.C[1][1]))
          && Object.hasOwn(data.payoffs, 'D')
          && Array.isArray(data.payoffs.D)
          && data.payoffs.D.length == 2
          && Array.isArray(data.payoffs.D[0])
          && data.payoffs.D[0].length == 2
          && !isNaN(number(data.payoffs.D[0][0]))
          && !isNaN(number(data.payoffs.D[0][1]))
          && Array.isArray(data.payoffs.D[1])
          && data.payoffs.D[1].length == 2
          && !isNaN(number(data.payoffs.D[1][0]))
          && !isNaN(number(data.payoffs.D[1][1]))) {
        payoffs = {
          'A': [
            [number(data.payoffs.A[0][0]), number(data.payoffs.A[0][1])],
            [number(data.payoffs.A[1][0]), number(data.payoffs.A[1][1])]
          ],
          'B': [
            [number(data.payoffs.B[0][0]), number(data.payoffs.B[0][1])],
            [number(data.payoffs.B[1][0]), number(data.payoffs.B[1][1])]
          ],
          'C': [
            [number(data.payoffs.C[0][0]), number(data.payoffs.C[0][1])],
            [number(data.payoffs.C[1][0]), number(data.payoffs.C[1][1])]
          ],
          'D': [
            [number(data.payoffs.D[0][0]), number(data.payoffs.D[0][1])],
            [number(data.payoffs.D[1][0]), number(data.payoffs.D[1][1])]
          ],
        };
      }
      if(Object.hasOwn(data, 'probCollab')
          && !isNaN(number(data.probCollab))
          && number(data.probCollab) >= 0
          && number(data.probCollab) <= 1) {
        probCollab = number(data.probCollab);
      }
      Object.keys(users).forEach((i) => {
        send(i, 'payoffs-changed', { 'payoffs': payoffs });
      });
    });

    // respond to admin setting up partners
    socket.on('setup-partners', (data) => {
      // only the signed-in admin may change the game
      if(socket !== admin) {
        return;
      }
      data = payload(data);
      if(Object.hasOwn(data, 'mode') && ['random', 'paired', 'hidden'].includes(data.mode)) {
        partnerMode = data.mode;
      }
      if(Object.hasOwn(data, 'mode') && data.mode === 'random') {
        // pair each user with random robot
        Object.keys(users).forEach((i) => {
          users[i].partner = null;
          users[i].partnerLabel = '<Random Robot>';
          send(i, 'partner-updated', { 'partnerLabel': users[i].partnerLabel });
        });
      } else if(Object.hasOwn(data, 'mode')
          && (data.mode === 'paired' || data.mode === 'hidden')) {
        // pair each connected user with a random connected user
        Object.keys(users).forEach((i) => {
          users[i].partner = null;
        });
        var userNames = Object.keys(users).filter(i => users[i].socket).sort(() => 0.5 - Math.random());
        while(userNames.length > 1) {
          var user1 = userNames.pop();
          var user2 = userNames.pop();
          users[user1].partner = user2;
          users[user2].partner = user1;
        }
        // users left over (odd one out, or waiting to reconnect) play a random robot
        Object.keys(users).forEach((i) => {
          if(data.mode === 'paired') {
            // send actual name of partner
            users[i].partnerLabel = users[i].partner ? users[i].partner : '<Random Robot>';
          } else {
            // hide actual name of partner
            users[i].partnerLabel = '<Hidden>';
          }
          send(i, 'partner-updated', { 'partnerLabel': users[i].partnerLabel });
        });
      }
    });

    // respond to admin resetting game
    socket.on('reset-game', (data) => {
      // only the signed-in admin may change the game
      if(socket !== admin) {
        return;
      }
      round = 0;
      rounds = [];
      // results after a reset belong to a new game
      if(results.length > 0 && results[results.length - 1].game === game) {
        game += 1;
      }
      Object.keys(users).forEach((i) => {
        users[i].score = 0;
        users[i].history.push({'reset': true});
        send(i, 'score-reset');
      });
      updateAdmin();
    });

    // respond to admin scoring game
    socket.on('score-game', (data) => {
      // only the signed-in admin may change the game
      if(socket !== admin) {
        return;
      }
      var delta = Object.create(null); // keyed by user name, like users
      var partnerStrategy = Object.create(null);
      // users waiting to reconnect sit this round out
      var players = Object.keys(users).filter(i => users[i].socket);
      if(players.length > 0) {
        round += 1;
      }
      countdown = null;
      players.forEach((i) => {
        var partner = users[i].partner;
        var partnerLabel = users[i].partnerLabel;
        if(isUser(partner) && users[partner].socket) {
          partnerStrategy[i] = users[partner].strategy;
        } else {
          // a random robot stands in for a missing partner
          partnerStrategy[i] = Math.random() > probCollab ? 'hare' : 'stag';
          if(partnerLabel === partner) {
            partnerLabel = '<Random Robot>';
          }
        }
        if(payoffs instanceof Array) {
          delta[i] = payoffs[users[i].strategy === 'stag' ? 0 : 1][partnerStrategy[i] === 'stag' ? 0 : 1]
        } else {
          delta[i] = payoffs[users[i].design][users[i].strategy === 'stag' ? 0 : 1][partnerStrategy[i] === 'stag' ? 0 : 1]
        }
        users[i].score += delta[i];
        var result = {
          'round': round,
          'score': users[i].score,
          'delta': delta[i],
          'strategy': users[i].strategy,
          'design': payoffs instanceof Array ? null : users[i].design,
          'partnerStrategy': partnerStrategy[i],
          'partnerLabel': partnerLabel
        };
        users[i].history.push(result);
        send(i, 'score-updated', result);
        var human = isUser(partner) && users[partner].socket;
        results.push({
          'game': game,
          'round': round,
          'time': new Date().toISOString(),
          'mode': payoffs instanceof Array ? 'simple' : 'complex',
          'player_id': users[i].id,
          'player': validator.unescape(i),
          'strategy': users[i].strategy,
          'tool': payoffs instanceof Array ? '' : toolNames[users[i].design],
          'partner_id': human ? users[partner].id : '',
          'partner': human ? validator.unescape(partner) : 'robot',
          'partner_strategy': partnerStrategy[i],
          'points': delta[i],
          'total': users[i].score
        });
      });
      if(players.length > 0) {
        // scored users sorted by decreasing score
        var summary = {
          'round': round,
          'users': players.map(
            i => ({
                'id': users[i].id,
                'user': i,
                'delta': delta[i],
                'score': users[i].score,
                'strategy': users[i].strategy,
                'partnerStrategy': partnerStrategy[i]
            })
          ).sort((a, b) => b.score - a.score)
        };
        rounds.push(summary);
        if(admin) {
          admin.emit('score-updated', summary);
        }
      }
      updateAdmin();
    });

    // results of every scored round as CSV, for the admin to download
    socket.on('export-results', () => {
      if(socket !== admin) {
        return;
      }
      socket.emit('export-results', {'csv': resultsCsv()});
    });

    // respond to user disconnect
    socket.on('disconnect', () => {
      if(admin === socket) {
        admin = null;
        // a countdown dies with the admin page that was running it
        countdown = null;
        Object.keys(users).forEach((i) => {
          send(i, 'round-countdown', countdownData());
        });
      } else if(owns(user, socket)) {
        holdUser(user);
      }
    });
  });
};
