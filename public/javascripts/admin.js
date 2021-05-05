$(function() {
  var ctx = document.getElementById('chartDecisions').getContext('2d');
  var chartDecisions = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Stag', 'Hare'],
        datasets: [{
            label: '# Decisions',
            data: [0, 0]
        }]
    },
    options: {
        scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        }
    }
  });
  var ctx = document.getElementById('chartOutcomes').getContext('2d');
  var chartOutcomes = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Stag / Stag', 'Hare / Stag', 'Hare / Hare', 'Stag / Hare' ],
        datasets: [{
            label: '# Outcomes',
            data: [0, 0, 0, 0]
        }]
    },
    options: {
        scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        }
    }
  });

  var socket = io();
  $('#login').modal('toggle');
  $('#login').submit(function(e) {
      e.preventDefault();
      socket.emit('login-admin', {
        'password': $('#inputPassword').val()
      });
  });
  socket.on('login-auth', function(data) {
    if(data.success) {
      $('#nav-login').addClass('d-none')
      $('#info').text('admin');
      $('#nav-info').removeClass('d-none');
      $('#login-error').text();
      $('#login').modal('toggle');
    } else {
      $('#login-error').text(data.message);
    }
  });
  $('#reset-game').on('click', function(e) {
    socket.emit('reset-game');
  });
  $('#score-game').on('click', function(e) {
    socket.emit('score-game');
  });
  $('#setup-partners').on('click', function(e) {
    updatePayoffs();
    socket.emit('setup-partners', {'mode': $('#selectPartners option:selected').val()});
  });
  function updatePayoffs() {
    if($('#modeSelect').val() === 'simple') {
      $('table.simple').show();
      $('table.complex').hide();
      var payoffs = [
        [$('#SS').val(), $('#SH').val()],
        [$('#HS').val(), $('#HH').val()]
      ];
      socket.emit('setup-payoffs', {'payoffs': payoffs, 'probCollab': $('#probCollab').val()});
    } else {
      $('table.simple').hide();
      $('table.complex').show();
      var payoffs = {
        "A": [[$('#A-SS').val(), $('#A-SH').val()], [$('#A-HS').val(), $('#A-HH').val()]],
        "B": [[$('#B-SS').val(), $('#B-SH').val()], [$('#B-HS').val(), $('#B-HH').val()]],
        "C": [[$('#C-SS').val(), $('#C-SH').val()], [$('#C-HS').val(), $('#C-HH').val()]],
        "D": [[$('#D-SS').val(), $('#D-SH').val()], [$('#D-HS').val(), $('#D-HH').val()]]
      }
      socket.emit('setup-payoffs', {'payoffs': payoffs, 'probCollab': $('#probCollab').val()});
    }
  }
  $('#modeSelect').on('change', function(e) {
    if($(this).val() === 'simple') {
      $('table.simple').show();
      $('table.complex').hide();
      updatePayoffs();
    } else {
      $('table.simple').hide();
      $('table.complex').show();
      updatePayoffs();
    }
  });
  socket.on('payoffs-changed', function(data) {
    if(data.payoffs instanceof Array) {
      $('#modeSelect').val('simple');
      $('table.simple').show();
      $('table.complex').hide();
      $('#SS').val(data.payoffs[0][0]);
      $('#SH').val(data.payoffs[0][1]);
      $('#HS').val(data.payoffs[1][0]);
      $('#HH').val(data.payoffs[1][1]);
    } else {
      $('#modeSelect').val('complex');
      $('table.simple').hide();
      $('table.complex').show();
      $('#A-SS').val(data.payoffs['A'][0][0]);
      $('#A-SH').val(data.payoffs['A'][0][1]);
      $('#A-HS').val(data.payoffs['A'][1][0]);
      $('#A-HH').val(data.payoffs['A'][1][1]);
      $('#B-SS').val(data.payoffs['B'][0][0]);
      $('#B-SH').val(data.payoffs['B'][0][1]);
      $('#B-HS').val(data.payoffs['B'][1][0]);
      $('#B-HH').val(data.payoffs['B'][1][1]);
      $('#C-SS').val(data.payoffs['C'][0][0]);
      $('#C-SH').val(data.payoffs['C'][0][1]);
      $('#C-HS').val(data.payoffs['C'][1][0]);
      $('#C-HH').val(data.payoffs['C'][1][1]);
      $('#D-SS').val(data.payoffs['D'][0][0]);
      $('#D-SH').val(data.payoffs['D'][0][1]);
      $('#D-HS').val(data.payoffs['D'][1][0]);
      $('#D-HH').val(data.payoffs['D'][1][1]);
    }
    $('#probCollab').val(data.probCollab);
  });
  socket.on('score-updated', function(data) {
    $('#scoreboard table tbody').empty();
    if(data.users) {
      var strategy = [0, 0]; // S, H
      var outcomes = [[0, 0], [0, 0]] // SS, SH, HS, HH
      for(var i=0; i < data.users.length; i++) {
        $('#scoreboard table tbody').append('<tr scope="row"><td>'+(i+1)+'</td><td>'+data.users[i].user+'</td><td>'+data.users[i].score+'</td></tr>');
        if(data.users[i].strategy) {
          strategy[data.users[i].strategy === 'stag' ? 0 : 1] += 1;
          outcomes[data.users[i].strategy === 'stag' ? 0 : 1][data.users[i].partnerStrategy === 'stag' ? 0 : 1] += 1;
        }
      }
      chartDecisions.data.datasets[0].data[0] = strategy[0];
      chartDecisions.data.datasets[0].data[1] = strategy[1];
      chartDecisions.update();
      chartOutcomes.data.datasets[0].data[0] = outcomes[0][0];
      chartOutcomes.data.datasets[0].data[1] = outcomes[1][0];
      chartOutcomes.data.datasets[0].data[2] = outcomes[1][1];
      chartOutcomes.data.datasets[0].data[3] = outcomes[0][1];
      chartOutcomes.update();
    }
  });
});
