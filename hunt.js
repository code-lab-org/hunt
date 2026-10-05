var validator = require('validator');

module.exports = function(io) {
  var admin = null;
  var users = {};
  var payoffs = [[4, 0], [3, 2]]; // [SS, SH], [HS, HH]
  /*
  var payoffs = {
    // [SS, SH], [HS, HH]
    "A": [[4, 0], [0, 0]],
    "B": [[3.5, 1.5], [1, 1]],
    "C": [[3.25, 0.25], [1, 1]],
    "D": [[0, 0], [3, 2]]
  };
  */

  var probCollab = 0.5;
  var nextUserId = 1; // unique per connection, since user names can be reused
  var round = 0; // rounds scored since the last reset

  // credentials are escaped the same way as login input so they compare equal
  var userPasscode = validator.escape(process.env.HUNT_USER_PASSCODE || 'attila');
  var adminPassword = validator.escape(process.env.HUNT_ADMIN_PASSWORD || 'admin');

  function removeUser(userName) {
    // remove the user as anyone's partner
    Object.keys(users).forEach((i) => {
      if(users[i].partner === userName) {
        users[i].partner = null;
        users[i].partnerLabel = '<Random Robot>';
        users[i].socket.emit('partner-updated', { 'partnerLabel': users[i].partnerLabel });
      }
    });
    // remove this user from the application
    if(users.hasOwnProperty(userName)) {
      console.log('User ' + userName + ' disconnected.');
      delete users[userName];
    }
  }

  function addUser(userName, socket) {
    if(Object.keys(users).includes(userName)) {
      return false;
    } else {
      users[userName] = {
        'id': nextUserId++,
        'socket': socket,
        'partner': null,
        'partnerLabel': '<Random Robot>',
        'score': 0,
        'strategy': 'hare',
        'design': 'D'
      };
      console.log('User ' + userName + ' connected.');
      if(admin) {
        // return users sorted by decreasing score
        admin.emit('game-updated', {
          'users': Object.keys(users).map(
            i => ({
                'id': users[i].id,
                'user': i,
                'score': users[i].score
            })
          ).sort((a, b) => b.score - a.score)
        });
      }
      return true;
    }
  }

  io.on('connection', (socket) => {
    var user;

    // respond to user login attempt
    socket.on('login-submit', (data) => {
      if(user !== null) {
        removeUser(user);
      }
      // authenticate unique user with master pass code
      if(!data.hasOwnProperty('user') || !data.hasOwnProperty('passcode')) {
          socket.emit('login-auth', {'success': false, 'message': 'Invalid request'});
          return;
      }
      var userInput = validator.escape(data.user + '');
      var passcodeInput = validator.escape(data.passcode + '');

      if(passcodeInput !== userPasscode) {
        socket.emit('login-auth', {'user': userInput, 'success': false, 'message': 'Incorrect pass code'});
      } else {
        if(addUser(userInput, socket)) {
          user = userInput;
          socket.emit('login-auth', {'user': userInput, 'success': true});
          socket.emit('payoffs-changed', {'payoffs': payoffs});
        } else {
          socket.emit('login-auth', {'user': userInput, 'success': false, 'message': 'User name in use'});
        }
      }
    });

    // respond to admin login attempt
    socket.on('login-admin', (data) => {
      // authenticate single admin with master password
      if(!data.hasOwnProperty('password')) {
          socket.emit('login-auth', {'success': false, 'message': 'Invalid request'});
          return;
      }
      var passwordInput = validator.escape(data.password + '');
      if(passwordInput !== adminPassword) {
        socket.emit('login-auth', {'success': false, 'message': 'Incorrect password'});
      } else if(admin !== null) {
        socket.emit('login-auth', {'success': false, 'message': 'Already logged in'});
      } else {
        admin = socket;
        socket.emit('login-auth', {'success': true});
        console.log('Admin connected.');
        socket.emit('payoffs-changed', {'payoffs': payoffs, 'probCollab': probCollab});
      }
    });

    // respond to user strategy change
    socket.on('strategy-select', (data) => {
      if(users.hasOwnProperty(user)
          && data.hasOwnProperty('strategy')
          && (data.strategy === 'hare' || data.strategy === 'stag')) {
        users[user].strategy = data.strategy;
      }
      if(users.hasOwnProperty(user)
          && data.hasOwnProperty('design')
          && (data.design === 'A' || data.design === 'B' || data.design === 'C' || data.design === 'D')) {
        users[user].design = data.design;
      }
    });

    // respond to admin changing payoffs
    socket.on('setup-payoffs', (data) => {
      if(data.hasOwnProperty('payoffs')
          && Array.isArray(data.payoffs)
          && data.payoffs.length == 2
          && Array.isArray(data.payoffs[0])
          && data.payoffs[0].length == 2
          && !isNaN(Number.parseFloat(data.payoffs[0][0]))
          && !isNaN(Number.parseFloat(data.payoffs[0][1]))
          && Array.isArray(data.payoffs[1])
          && data.payoffs[1].length == 2
          && !isNaN(Number.parseFloat(data.payoffs[1][0]))
          && !isNaN(Number.parseFloat(data.payoffs[1][1]))) {
        payoffs = [
          [Number.parseFloat(data.payoffs[0][0]), Number.parseFloat(data.payoffs[0][1])],
          [Number.parseFloat(data.payoffs[1][0]), Number.parseFloat(data.payoffs[1][1])]
        ];
      } else if(data.hasOwnProperty('payoffs')
          && data.payoffs.hasOwnProperty('A')
          && Array.isArray(data.payoffs.A)
          && data.payoffs.A.length == 2
          && Array.isArray(data.payoffs.A[0])
          && data.payoffs.A[0].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.A[0][0]))
          && !isNaN(Number.parseFloat(data.payoffs.A[0][1]))
          && Array.isArray(data.payoffs.A[1])
          && data.payoffs.A[1].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.A[1][0]))
          && !isNaN(Number.parseFloat(data.payoffs.A[1][1]))
          && data.payoffs.hasOwnProperty('B')
          && Array.isArray(data.payoffs.B)
          && data.payoffs.B.length == 2
          && Array.isArray(data.payoffs.B[0])
          && data.payoffs.B[0].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.B[0][0]))
          && !isNaN(Number.parseFloat(data.payoffs.B[0][1]))
          && Array.isArray(data.payoffs.B[1])
          && data.payoffs.B[1].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.B[1][0]))
          && !isNaN(Number.parseFloat(data.payoffs.B[1][1]))
          && data.payoffs.hasOwnProperty('C')
          && Array.isArray(data.payoffs.C)
          && data.payoffs.C.length == 2
          && Array.isArray(data.payoffs.C[0])
          && data.payoffs.C[0].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.C[0][0]))
          && !isNaN(Number.parseFloat(data.payoffs.C[0][1]))
          && Array.isArray(data.payoffs.C[1])
          && data.payoffs.C[1].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.C[1][0]))
          && !isNaN(Number.parseFloat(data.payoffs.C[1][1]))
          && data.payoffs.hasOwnProperty('D')
          && Array.isArray(data.payoffs.D)
          && data.payoffs.D.length == 2
          && Array.isArray(data.payoffs.D[0])
          && data.payoffs.D[0].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.D[0][0]))
          && !isNaN(Number.parseFloat(data.payoffs.D[0][1]))
          && Array.isArray(data.payoffs.D[1])
          && data.payoffs.D[1].length == 2
          && !isNaN(Number.parseFloat(data.payoffs.D[1][0]))
          && !isNaN(Number.parseFloat(data.payoffs.D[1][1]))) {
        payoffs = {
          'A': [
            [Number.parseFloat(data.payoffs.A[0][0]), Number.parseFloat(data.payoffs.A[0][1])],
            [Number.parseFloat(data.payoffs.A[1][0]), Number.parseFloat(data.payoffs.A[1][1])]
          ],
          'B': [
            [Number.parseFloat(data.payoffs.B[0][0]), Number.parseFloat(data.payoffs.B[0][1])],
            [Number.parseFloat(data.payoffs.B[1][0]), Number.parseFloat(data.payoffs.B[1][1])]
          ],
          'C': [
            [Number.parseFloat(data.payoffs.C[0][0]), Number.parseFloat(data.payoffs.C[0][1])],
            [Number.parseFloat(data.payoffs.C[1][0]), Number.parseFloat(data.payoffs.C[1][1])]
          ],
          'D': [
            [Number.parseFloat(data.payoffs.D[0][0]), Number.parseFloat(data.payoffs.D[0][1])],
            [Number.parseFloat(data.payoffs.D[1][0]), Number.parseFloat(data.payoffs.D[1][1])]
          ],
        };
      }
      if(data.hasOwnProperty('probCollab')
          && !isNaN(Number.parseFloat(data.probCollab))
          && Number.parseFloat(data.probCollab) >= 0
          && Number.parseFloat(data.probCollab) <= 1) {
        probCollab = Number.parseFloat(data.probCollab);
      }
      Object.keys(users).forEach((i) => {
        users[i].socket.emit('payoffs-changed', { 'payoffs': payoffs });
      });
    });

    // respond to admin setting up partners
    socket.on('setup-partners', (data) => {
      if(data.hasOwnProperty('mode') && data.mode === 'random') {
        // pair each user with random robot
        Object.keys(users).forEach((i) => {
          users[i].partner = null;
          users[i].partnerLabel = '<Random Robot>';
          users[i].socket.emit('partner-updated', { 'partnerLabel': users[i].partnerLabel });
        });
      } else if(data.hasOwnProperty('mode')
          && (data.mode === 'paired' || data.mode === 'hidden')) {
        // pair each user with random user
        var userNames = Object.keys(users).sort(() => 0.5 - Math.random());
        while(userNames.length > 1) {
          user1 = userNames.pop();
          user2 = userNames.pop();
          users[user1].partner = user2;
          users[user2].partner = user1;
        }
        // if odd number of players, pair last with a random robot
        if(userNames.length === 1) {
          users[userNames[0]].partner = null;
        }
        Object.keys(users).forEach((i) => {
          if(data.mode === 'paired') {
            // send actual name of partner
            users[i].partnerLabel = users[i].partner ? users[i].partner : '<Random Robot>';
          } else {
            // hide actual name of partner
            users[i].partnerLabel = '<Hidden>';
          }
          users[i].socket.emit('partner-updated', { 'partnerLabel': users[i].partnerLabel });
        });
      }
    });

    // respond to admin resetting game
    socket.on('reset-game', (data) => {
      round = 0;
      Object.keys(users).forEach((i) => {
        users[i].score = 0;
        users[i].socket.emit('score-reset');
      });
      if(admin) {
        // return users sorted in alphabetical order
        admin.emit('score-updated', {
          'users': Object.keys(users).map(
            i => ({
                'id': users[i].id,
                'user': i,
                'score': users[i].score
            })
          ).sort((a, b) => a.user.localeCompare(b.user))
        });
      }
    });

    // respond to admin scoring game
    socket.on('score-game', (data) => {
      var delta = {};
      var partnerStrategy = {};
      if(Object.keys(users).length > 0) {
        round += 1;
      }
      Object.keys(users).forEach((i) => {
        if(users.hasOwnProperty(users[i].partner)) {
          partnerStrategy[i] = users[users[i].partner].strategy;
        } else {
          partnerStrategy[i] = Math.random() > probCollab ? 'hare' : 'stag';
        }
        if(payoffs instanceof Array) {
          delta[i] = payoffs[users[i].strategy === 'stag' ? 0 : 1][partnerStrategy[i] === 'stag' ? 0 : 1]
        } else {
          delta[i] = payoffs[users[i].design][users[i].strategy === 'stag' ? 0 : 1][partnerStrategy[i] === 'stag' ? 0 : 1]
        }
        users[i].score += delta[i];
        users[i].socket.emit('score-updated', {
          'round': round,
          'score': users[i].score,
          'delta': delta[i],
          'strategy': users[i].strategy,
          'design': payoffs instanceof Array ? null : users[i].design,
          'partnerStrategy': partnerStrategy[i],
          'partnerLabel': users[i].partnerLabel
        });
      });
      if(admin) {
        // return users sorted by decreasing score
        admin.emit('score-updated', {
          'round': round,
          'users': Object.keys(users).map(
            i => ({
                'id': users[i].id,
                'user': i,
                'delta': delta[i],
                'score': users[i].score,
                'strategy': users[i].strategy,
                'partnerStrategy': partnerStrategy[i]
            })
          ).sort((a, b) => b.score - a.score)
        });
      }
    });

    // respond to user disconnect
    socket.on('disconnect', () => {
      if(admin === socket) {
        admin = null;
      } else {
        removeUser(user);
      }
    });
  });
};
