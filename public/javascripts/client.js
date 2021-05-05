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

  $('#login').modal('toggle');
  $('#login').submit(function(e) {
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
      $('#login').modal('toggle');
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
      $('.col-stag').removeClass('bg-light font-weight-bold');
      $('.col-hare').addClass('bg-light font-weight-bold');
    } else if(strategy==='stag') {
      $('.col-hare').removeClass('bg-light font-weight-bold');
      $('.col-stag').addClass('bg-light font-weight-bold');
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
  socket.on('score-updated', function(data) {
    var partner = data.partnerLabel ? data.partnerLabel : '<Unknown>';
    $('#log').val(new Date().toLocaleTimeString() + ' | Earned ' + data.delta + ' (total: ' + data.score + '). You selected ' + data.strategy + ', ' + partner + ' selected ' + data.partnerStrategy + '.\n' + $('#log').val());
    $('#info').text(user + ": " + data.score);
  });
  socket.on('score-reset', function(data) {
    $('#log').val(new Date().toLocaleTimeString() + ' | Score Reset' + '\n' + $('#log').val());
    $('#info').text(user + ": " + 0);
  });
  socket.on('partner-updated', function(data) {
    if(data.partnerLabel) {
      $('#partner').val(data.partnerLabel);
    } else {
      $('#partner').val("<Random Robot>");
    }
  });
});
