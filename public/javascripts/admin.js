$(function() {
  // each decision and outcome keeps the same color in every chart
  var colors = {
    'stag': '#2a78d6', 'hare': '#eb6834',
    'SS': '#2a78d6', 'HS': '#eb6834', 'HH': '#1baf7a', 'SH': '#eda100'
  };
  Chart.defaults.font.family = $('body').css('font-family');
  Chart.defaults.color = '#52514e';
  Chart.defaults.borderColor = '#e1e0d9';

  var ctx = document.getElementById('chartDecisions').getContext('2d');
  var chartDecisions = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Stag', 'Hare'],
        datasets: [{
            label: '# Decisions',
            data: [0, 0],
            backgroundColor: [colors.stag, colors.hare],
            borderRadius: 4
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true,
                ticks: { precision: 0 }
            }
        },
        plugins: { legend: { display: false } }
    }
  });
  var ctx = document.getElementById('chartOutcomes').getContext('2d');
  var chartOutcomes = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Stag / Stag', 'Hare / Stag', 'Hare / Hare', 'Stag / Hare' ],
        datasets: [{
            label: '# Outcomes',
            data: [0, 0, 0, 0],
            backgroundColor: [colors.SS, colors.HS, colors.HH, colors.SH],
            borderRadius: 4
        }]
    },
    options: {
        scales: {
            y: {
                beginAtZero: true,
                ticks: { precision: 0 }
            }
        },
        plugins: { legend: { display: false } }
    }
  });

  // label each line at its last point, nudged apart so labels never overlap
  var endLabels = {
    id: 'endLabels',
    afterDatasetsDraw: function(chart) {
      var labels = chart.data.datasets.map(function(dataset, i) {
        var points = chart.getDatasetMeta(i).data;
        var last = points[points.length - 1];
        if(!last || !chart.isDatasetVisible(i)) {
          return null;
        }
        return {'text': dataset.label, 'color': dataset.borderColor, 'x': last.x, 'y': last.y};
      }).filter(Boolean).sort(function(a, b) { return a.y - b.y; });
      var lineHeight = 15;
      for(var i = 1; i < labels.length; i++) {
        labels[i].y = Math.max(labels[i].y, labels[i-1].y + lineHeight);
      }
      for(var i = labels.length - 1; i >= 0; i--) {
        var limit = i === labels.length - 1 ? chart.chartArea.bottom : labels[i+1].y - lineHeight;
        labels[i].y = Math.min(labels[i].y, limit);
      }
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '12px ' + Chart.defaults.font.family;
      ctx.textBaseline = 'middle';
      labels.forEach(function(label) {
        ctx.fillStyle = label.color;
        ctx.fillRect(label.x + 8, label.y - 1, 10, 2);
        ctx.fillStyle = '#52514e';
        ctx.fillText(label.text, label.x + 22, label.y);
      });
      ctx.restore();
    }
  };

  function trajectoryChart(id, yTitle, series) {
    return new Chart(document.getElementById(id).getContext('2d'), {
      type: 'line',
      data: {
          labels: [],
          datasets: series.map(function(s) {
            return {
              label: s.label,
              data: [],
              borderColor: colors[s.key],
              backgroundColor: colors[s.key],
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBorderColor: '#ffffff',
              pointBorderWidth: 2,
              clip: 8
            };
          })
      },
      options: {
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          layout: { padding: { right: 100 } },
          scales: {
              x: {
                  title: { display: true, text: 'Round' },
                  grid: { display: false }
              },
              y: {
                  min: 0,
                  max: 100,
                  title: { display: true, text: yTitle },
                  ticks: {
                      stepSize: 25,
                      callback: function(value) { return value + '%'; }
                  }
              }
          },
          plugins: {
              tooltip: {
                  callbacks: {
                      title: function(items) { return 'Round ' + items[0].label; },
                      label: function(item) { return item.dataset.label + ': ' + Math.round(item.parsed.y) + '%'; }
                  }
              }
          }
      },
      plugins: [endLabels]
    });
  }
  var chartDecisionTrajectory = trajectoryChart('chartDecisionTrajectory', '% of decisions', [
    {'key': 'stag', 'label': 'Stag'},
    {'key': 'hare', 'label': 'Hare'}
  ]);
  var chartOutcomeTrajectory = trajectoryChart('chartOutcomeTrajectory', '% of outcomes', [
    {'key': 'SS', 'label': 'Stag / Stag'},
    {'key': 'HS', 'label': 'Hare / Stag'},
    {'key': 'HH', 'label': 'Hare / Hare'},
    {'key': 'SH', 'label': 'Stag / Hare'}
  ]);
  function addRound(chart, counts, total) {
    chart.data.labels.push(chart.data.labels.length + 1);
    counts.forEach(function(count, i) {
      chart.data.datasets[i].data.push(100 * count / total);
    });
    chart.update();
  }
  function clearRounds(chart) {
    chart.data.labels = [];
    chart.data.datasets.forEach(function(dataset) {
      dataset.data = [];
    });
    chart.update();
  }

  var socket = io();
  var loginModal = new bootstrap.Modal('#login');
  loginModal.toggle();
  $('#login').on('submit', function(e) {
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
      loginModal.toggle();
    } else {
      $('#login-error').text(data.message);
    }
  });
  $('#reset-game').on('click', function(e) {
    socket.emit('reset-game');
    clearRounds(chartDecisionTrajectory);
    clearRounds(chartOutcomeTrajectory);
  });
  $('#score-game').on('click', function(e) {
    socket.emit('score-game');
  });
  // score several rounds in a row, waiting between rounds
  document.getElementById('execute').addEventListener('shown.bs.modal', function() {
    $('#executeRounds').trigger('focus');
  });
  var execution = null; // {rounds, delay, round, nextAt, timer} while running
  $('#execute-game').on('click', function(e) {
    if(execution) {
      stopExecution();
    } else {
      bootstrap.Modal.getOrCreateInstance('#execute').show();
    }
  });
  $('#execute-form').on('submit', function(e) {
    e.preventDefault();
    bootstrap.Modal.getOrCreateInstance('#execute').hide();
    execution = {
      'rounds': parseInt($('#executeRounds').val(), 10),
      'delay': Number.parseFloat($('#executeDelay').val()) * 1000,
      'round': 0,
      'nextAt': Date.now(),
      'timer': null
    };
    $('#execute-game').attr('title', 'Stop remaining rounds');
    tickExecution();
  });
  function tickExecution() {
    // score every round that is due, then wake at the next whole second of the countdown
    while(execution && Date.now() >= execution.nextAt) {
      execution.round += 1;
      socket.emit('score-game');
      if(execution.round >= execution.rounds) {
        stopExecution();
      } else {
        execution.nextAt = Date.now() + execution.delay;
      }
    }
    if(!execution) {
      return;
    }
    var remaining = execution.nextAt - Date.now();
    $('#execute-game').html('<span class="countdown" aria-hidden="true">'
      + '<span class="spinner-border"></span>'
      + '<span class="countdown-value">' + Math.ceil(remaining / 1000) + '</span></span> '
      + '<span role="status">Round ' + execution.round + ' of ' + execution.rounds + '</span>');
    execution.timer = setTimeout(tickExecution, remaining % 1000 || 1000);
  }
  function stopExecution() {
    clearTimeout(execution.timer);
    execution = null;
    $('#execute-game').removeAttr('title').text('Execute...');
  }
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
      // reset-game sends users without strategies, so only scored rounds extend the trajectories
      var total = strategy[0] + strategy[1];
      if(total > 0) {
        addRound(chartDecisionTrajectory, strategy, total);
        addRound(chartOutcomeTrajectory, [outcomes[0][0], outcomes[1][0], outcomes[1][1], outcomes[0][1]], total);
      }
    }
  });
});
