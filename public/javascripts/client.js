$(function() {
  var user = "";
  var socket = io();
  var payoffs = {};

  // the session (user name and resume token) survives reloads within this tab
  var session = null;
  var replaced = false;
  try {
    session = JSON.parse(sessionStorage.getItem('hunt-session'));
  } catch(e) {}
  function saveSession(value) {
    session = value;
    try {
      if(value) {
        sessionStorage.setItem('hunt-session', JSON.stringify(value));
      } else {
        sessionStorage.removeItem('hunt-session');
      }
    } catch(e) {}
  }

  function updatePoints(payoffs) {
    if(payoffs instanceof Array) {
      $("#tool").hide();
      $('#SS').val(payoffs[0][0]);
      $('#SH').val(payoffs[0][1]);
      $('#HH').val(payoffs[1][1]);
      $('#HS').val(payoffs[1][0]);
    } else {
      $("#tool").show();
      var toolHare = $('input[name=tool-hare]:checked').val();
      var toolStag = $('input[name=tool-stag]:checked').val();
      $('#SS').val(payoffs[toolStag][0][0]);
      $('#SH').val(payoffs[toolStag][0][1]);
      $('#HH').val(payoffs[toolHare][1][1]);
      $('#HS').val(payoffs[toolHare][1][0]);
    }
  }

  var loginModal = new bootstrap.Modal('#login');
  function showLogin(message) {
    $('#login-error').text(message || '');
    loginModal.show();
  }
  $('#login').on('submit', function(e) {
      e.preventDefault();
      replaced = false;
      socket.emit('login-submit', {
        'user': $('#inputUser').val(),
        'passcode': $('#inputPasscode').val()
      });
  });
  socket.on('connect', function() {
    // resume after a reload or dropped connection; otherwise ask the user to sign in
    if(session && !replaced) {
      socket.emit('resume', session);
    } else if(!user) {
      showLogin();
    }
  });
  socket.on('disconnect', function() {
    if(user) {
      $('#connection-alert').removeClass('d-none');
    }
    showCountdown({'round': null, 'remaining': 0});
  });
  socket.on('login-auth', function(data) {
    if(data.success) {
      user = data.user;
      saveSession({'user': data.user, 'token': data.token});
      $('#nav-login').addClass('d-none')
      $('#info').text(decode(user) + ": " + formatPoints(data.score));
      $('#nav-info').removeClass('d-none');
      $('#connection-alert').addClass('d-none');
      $('#login-error').text('');
      loginModal.hide();
      // show the choice the server has for this user (it persists across reloads)
      $('input[name=tool-' + data.strategy + '][value=' + data.design + ']').prop('checked', true);
      $('#strategy-' + data.strategy).prop('checked', true).trigger('change');
    } else {
      $('#login-error').text(data.message);
    }
  });
  socket.on('resume-failed', function() {
    user = '';
    saveSession(null);
    $('#connection-alert').addClass('d-none');
    $('#nav-info').addClass('d-none');
    $('#nav-login').removeClass('d-none');
    showLogin('Your session has expired. Please sign in again.');
  });
  socket.on('session-replaced', function() {
    // this game continues in another tab or window; stop playing here
    replaced = true;
    user = '';
    $('#nav-info').addClass('d-none');
    $('#nav-login').removeClass('d-none');
    showLogin('You are playing in another tab or window.');
  });
  $('input[name=tool-stag]').on('change', function(e) {
    $('input[name=strategy][value=stag]').prop('checked', true).trigger('click');
    updatePoints(payoffs);
  });
  $('input[name=tool-hare]').on('change', function(e) {
    $('input[name=strategy][value=hare]').prop('checked', true).trigger('click');
    updatePoints(payoffs);
  });
  $('input[name=strategy],input[name=tool-hare],input[name=tool-stag]').on('change', function(e) {
    var strategy = $('input[name=strategy]:checked').val();
    if(strategy==='hare') {
      $('.col-stag').removeClass('bg-light fw-bold');
      $('.col-hare').addClass('bg-light fw-bold');
    } else if(strategy==='stag') {
      $('.col-hare').removeClass('bg-light fw-bold');
      $('.col-stag').addClass('bg-light fw-bold');
    }
    $('.col-stag').animate({opacity: strategy==='stag'?1.0:0.25});
    $('.col-hare').animate({opacity: strategy==='hare'?1.0:0.25});
    var design = (
        strategy === 'hare' ? $('input[name=tool-hare]:checked').val()
        : $('input[name=tool-stag]:checked').val()
    );
    socket.emit('strategy-select', {
      'strategy': strategy,
      'design': design
    });
  });
  socket.on('payoffs-changed', function(data) {
    var fields = ['#SS', '#SH', '#HS', '#HH'];
    var before = fields.map(function(id) { return $(id).val(); });
    // the first payoffs (sign-in or resume) aren't a change
    var changed = Object.keys(payoffs).length > 0 && JSON.stringify(data.payoffs) !== JSON.stringify(payoffs);
    payoffs = data.payoffs;
    updatePoints(payoffs);
    if(changed) {
      // draw attention to points the admin changed mid-game
      fields.forEach(function(id, i) {
        if($(id).val() !== before[i]) {
          $(id).removeClass('flash');
          void $(id)[0].offsetWidth; // restart the animation
          $(id).addClass('flash');
        }
      });
      $('#points-status').text('').text('Points updated');
    }
  });

  // countdown to the next round while the admin runs several rounds
  var countdownEndsAt = null;
  var countdownTimer = null;
  function showCountdown(data) {
    clearInterval(countdownTimer);
    if(!data.round) {
      countdownEndsAt = null;
      $('#round-countdown').addClass('d-none');
      return;
    }
    countdownEndsAt = Date.now() + data.remaining;
    $('#round-countdown-round').text(data.round);
    $('#round-countdown').removeClass('d-none');
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 250);
  }
  function tickCountdown() {
    var seconds = Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
    $('#round-countdown-value').text(seconds);
    $('#round-countdown-text').text(seconds > 0 ? 'scores in ' + seconds + (seconds === 1 ? ' second' : ' seconds') : 'is being scored');
  }
  socket.on('round-countdown', showCountdown);

  var toolNames = {'A': 'Atlatl', 'B': 'Bow', 'C': 'Club', 'D': 'Dog'};
  function decode(text) {
    // user names arrive HTML-escaped; decode them and insert as text only
    return $('<textarea>').html(text).text();
  }
  function formatPoints(value) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function choiceBadge(strategy, design) {
    return $('<span class="badge">').addClass('badge-' + strategy)
      .text((strategy === 'stag' ? 'Stag' : 'Hare') + (design ? ' · ' + toolNames[design] : ''));
  }
  function partnerChoice(data) {
    var partner = data.partnerLabel ? decode(data.partnerLabel) : '<Unknown>';
    return [choiceBadge(data.partnerStrategy), ' ', $('<small class="text-muted">').text(partner)];
  }
  function showRound(data) {
    var points = (data.delta < 0 ? '' : '+') + formatPoints(data.delta);
    // latest round in the card, every round in the history table (newest first)
    $('#last-round-empty').addClass('d-none');
    $('#last-round-body').removeClass('d-none');
    $('#last-round-title').text('Round ' + data.round);
    $('#last-round-you').empty().append(choiceBadge(data.strategy, data.design));
    $('#last-round-partner').empty().append(partnerChoice(data));
    $('#last-round-points').text(points + (Math.abs(data.delta) === 1 ? ' point' : ' points'));
    $('#last-round-total').text('Total: ' + formatPoints(data.score));
    $('#history tbody').prepend($('<tr>').append(
      $('<td>').text(data.round),
      $('<td>').append(choiceBadge(data.strategy, data.design)),
      $('<td>').append(partnerChoice(data)),
      $('<td class="text-end">').text(points),
      $('<td class="text-end">').text(formatPoints(data.score))
    ));
    $('#info').text(decode(user) + ": " + formatPoints(data.score));
  }
  function showReset() {
    $('#last-round-body').addClass('d-none');
    $('#last-round-empty').removeClass('d-none').text('Score reset. Waiting for the next round.');
    $('#history tbody').prepend('<tr><td colspan="5" class="text-center text-muted small">Score reset</td></tr>');
    $('#info').text(decode(user) + ": " + 0);
  }
  socket.on('score-updated', function(data) {
    showCountdown({'round': null, 'remaining': 0});
    showRound(data);
  });
  socket.on('score-reset', showReset);
  socket.on('score-history', function(data) {
    // rebuild the summary after resuming (the page may have been reloaded)
    $('#history tbody').empty();
    $('#last-round-body').addClass('d-none');
    $('#last-round-empty').removeClass('d-none').text('No rounds scored yet.');
    data.history.forEach(function(entry) {
      if(entry.reset) {
        showReset();
      } else {
        showRound(entry);
      }
    });
  });
  socket.on('partner-updated', function(data) {
    if(data.partnerLabel) {
      $('#partner').val(decode(data.partnerLabel));
    } else {
      $('#partner').val("<Random Robot>");
    }
  });
});
