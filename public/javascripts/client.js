$(function() {
  var user = "";
  var socket = io();
  var payoffs = {};

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
  loginModal.toggle();
  $('#login').on('submit', function(e) {
      e.preventDefault();
      socket.emit('login-submit', {
        'user': $('#inputUser').val(),
        'passcode': $('#inputPasscode').val()
      });
  });
  socket.on('login-auth', function(data) {
    if(data.success) {
      user = data.user;
      $('#nav-login').addClass('d-none')
      $('#info').text(user + ": " + 0);
      $('#nav-info').removeClass('d-none');
      $('#login-error').text();
      loginModal.toggle();
    } else {
      $('#login-error').text(data.message);
    }
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
    payoffs = data.payoffs;
    updatePoints(payoffs);
  });
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
  socket.on('score-updated', function(data) {
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
    $('#info').text(user + ": " + data.score);
  });
  socket.on('score-reset', function(data) {
    $('#last-round-body').addClass('d-none');
    $('#last-round-empty').removeClass('d-none').text('Score reset. Waiting for the next round.');
    $('#history tbody').prepend('<tr><td colspan="5" class="text-center text-muted small">Score reset</td></tr>');
    $('#info').text(user + ": " + 0);
  });
  socket.on('partner-updated', function(data) {
    if(data.partnerLabel) {
      $('#partner').val(decode(data.partnerLabel));
    } else {
      $('#partner').val("<Random Robot>");
    }
  });
});
