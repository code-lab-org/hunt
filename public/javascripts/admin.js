$(function() {
  // each decision and outcome keeps the same color in every chart
  var colors = {
    'stag': '#2a78d6', 'hare': '#eb6834',
    'SS': '#2a78d6', 'HS': '#eb6834', 'HH': '#1baf7a', 'SH': '#eda100'
  };
  // users take these in order of first appearance; with more users all lines turn gray
  var userColors = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  var mutedLine = '#c3c2b7';
  Chart.defaults.font.family = $('body').css('font-family');
  Chart.defaults.color = '#52514e';
  Chart.defaults.borderColor = '#e1e0d9';

  // label each line at its last point, nudged apart so labels never overlap
  var endLabels = {
    id: 'endLabels',
    afterDatasetsDraw: function(chart, args, options) {
      if(options.display === false) {
        return;
      }
      var labels = chart.data.datasets.map(function(dataset, i) {
        // only lines that reach the latest round are labeled; the legend names the rest
        var last = dataset.data.length - 1;
        var point = chart.getDatasetMeta(i).data[last];
        if(!point || dataset.data[last] === null || !chart.isDatasetVisible(i)) {
          return null;
        }
        return {'text': dataset.label, 'color': dataset.borderColor, 'x': point.x, 'y': point.y};
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

  function lineDataset(label, color) {
    return {
      label: label,
      data: [],
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2,
      clip: 8
    };
  }
  function lineChart(id, yTitle, datasets, percent, plugin) {
    return new Chart(document.getElementById(id).getContext('2d'), {
      type: 'line',
      data: {
          labels: [],
          datasets: datasets
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
              y: percent ? {
                  min: 0,
                  max: 100,
                  title: { display: true, text: yTitle },
                  ticks: {
                      stepSize: 25,
                      callback: function(value) { return value + '%'; }
                  }
              } : {
                  beginAtZero: true,
                  title: { display: true, text: yTitle }
              }
          },
          plugins: {
              tooltip: {
                  callbacks: {
                      title: function(items) { return 'Round ' + items[0].label; },
                      label: function(item) {
                        return item.dataset.label + ': ' + (percent
                          ? Math.round(item.parsed.y) + '%'
                          : item.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 }));
                      }
                  }
              }
          }
      },
      plugins: plugin ? [endLabels, plugin] : [endLabels]
    });
  }
  function decisionDatasets() {
    return [lineDataset('Stag', colors.stag), lineDataset('Hare', colors.hare)];
  }
  function outcomeDatasets() {
    return [
      lineDataset('Stag / Stag', colors.SS),
      lineDataset('Hare / Stag', colors.HS),
      lineDataset('Hare / Hare', colors.HH),
      lineDataset('Stag / Hare', colors.SH)
    ];
  }
  var chartDecisionTrajectory = lineChart('chartDecisionTrajectory', '% of decisions', decisionDatasets(), true);
  var chartOutcomeTrajectory = lineChart('chartOutcomeTrajectory', '% of outcomes', outcomeDatasets(), true);
  var chartCumulativeDecisions = lineChart('chartCumulativeDecisions', 'Cumulative % of decisions', decisionDatasets(), true);
  var chartCumulativeOutcomes = lineChart('chartCumulativeOutcomes', 'Cumulative % of outcomes', outcomeDatasets(), true);
  var chartCumulativeValue = lineChart('chartCumulativeValue', 'Cumulative value', [], false, {
    // runs after Chart.js handles each event, so leaving the canvas clears the highlight
    id: 'highlightUser',
    afterEvent: function(chart, args) {
      var active = args.event.type === 'mouseout' ? [] : chart.getActiveElements();
      highlightUser(chart, active.length ? active[0].datasetIndex : null);
    }
  });

  // running totals behind the cumulative charts, cleared on reset
  var totals = {'decisions': [0, 0], 'outcomes': [0, 0, 0, 0], 'count': 0};
  function percentages(counts, total) {
    return counts.map(function(count) {
      return 100 * count / total;
    });
  }
  function addRound(chart, round, values) {
    chart.data.labels.push(round);
    values.forEach(function(value, i) {
      chart.data.datasets[i].data.push(value);
    });
    chart.update();
  }
  function addValueRound(label, users) {
    var chart = chartCumulativeValue;
    var round = chart.data.labels.length;
    chart.data.labels.push(label);
    // rounds without a user (before joining, after leaving) stay empty and show as gaps
    chart.data.datasets.forEach(function(dataset) {
      dataset.data.push(null);
    });
    users.forEach(function(user) {
      var dataset = chart.data.datasets.find(function(d) { return d.userId === user.id; });
      if(!dataset) {
        // user names arrive HTML-escaped; decode them for the canvas
        var name = $('<textarea>').html(user.user).text();
        var reused = chart.data.datasets.filter(function(d) { return d.userName === name; }).length;
        dataset = lineDataset(reused ? name + ' (' + (reused + 1) + ')' : name, mutedLine);
        dataset.userId = user.id;
        dataset.userName = name;
        dataset.data = new Array(round + 1).fill(null);
        chart.data.datasets.push(dataset);
      }
      dataset.data[round] = user.score;
    });
    styleUsers(chart);
    chart.update();
  }
  function styleUsers(chart) {
    // up to eight users get their own color and labels; beyond that, gray lines with hover highlight
    var many = chart.data.datasets.length > userColors.length;
    chart.data.datasets.forEach(function(dataset, i) {
      var color = many ? mutedLine : userColors[i];
      dataset.borderColor = color;
      dataset.backgroundColor = color;
      dataset.borderWidth = many ? 1.5 : 2;
      dataset.pointRadius = many ? 0 : 4;
      dataset.order = 0;
    });
    chart.options.interaction = many ? { mode: 'nearest', intersect: false } : { mode: 'index', intersect: false };
    chart.options.plugins.legend.display = !many;
    chart.options.plugins.endLabels = { display: !many };
    chart.highlighted = null;
  }
  function highlightUser(chart, index) {
    if(chart.data.datasets.length <= userColors.length || chart.highlighted === index) {
      return;
    }
    chart.highlighted = index;
    chart.data.datasets.forEach(function(dataset, i) {
      dataset.borderColor = i === index ? userColors[0] : mutedLine;
      dataset.backgroundColor = dataset.borderColor;
      dataset.borderWidth = i === index ? 3 : 1.5;
      dataset.order = i === index ? 0 : 1;
    });
    chart.update('none');
  }
  function clearRounds() {
    [chartDecisionTrajectory, chartOutcomeTrajectory, chartCumulativeDecisions, chartCumulativeOutcomes].forEach(function(chart) {
      chart.data.labels = [];
      chart.data.datasets.forEach(function(dataset) {
        dataset.data = [];
      });
      chart.update();
    });
    chartCumulativeValue.data.labels = [];
    chartCumulativeValue.data.datasets = [];
    styleUsers(chartCumulativeValue);
    chartCumulativeValue.update();
    totals = {'decisions': [0, 0], 'outcomes': [0, 0, 0, 0], 'count': 0};
  }

  // per-round / cumulative toggles show one of the two charts in a pane
  $('#dashboard-content .btn-check').on('change', function(e) {
    var pane = $(this).closest('.tab-pane');
    pane.find('[data-view]').addClass('d-none');
    pane.find('[data-view="' + this.value + '"]').removeClass('d-none');
  });

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
    clearRounds();
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
    var delay = Number.parseFloat($('#executeDelay').val()) * 1000;
    execution = {
      'rounds': parseInt($('#executeRounds').val(), 10),
      'delay': delay,
      'round': 0,
      // count down to the first round too, so players can choose before it is scored
      'nextAt': Date.now() + delay,
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
    // the countdown is to the round shown
    var remaining = execution.nextAt - Date.now();
    $('#execute-game').html('<span class="countdown" aria-hidden="true">'
      + '<span class="spinner-border"></span>'
      + '<span class="countdown-value">' + Math.ceil(remaining / 1000) + '</span></span> '
      + '<span role="status">Round ' + (execution.round + 1) + ' of ' + execution.rounds + '</span>');
    execution.timer = setTimeout(tickExecution, remaining % 1000 || 1000);
  }
  function stopExecution() {
    clearTimeout(execution.timer);
    execution = null;
    $('#execute-game').removeAttr('title').text('Execute...');
  }
  // apply setup as soon as a value is committed (change fires on enter/blur, not every keystroke)
  $('table.simple input, table.complex input, #probCollab').on('change', function(e) {
    updatePayoffs();
  });
  $('#selectPartners').on('change', function(e) {
    socket.emit('setup-partners', {'mode': $(this).val()});
    // re-pairing only matters when players are paired with each other
    $('#repair-partners').prop('disabled', $(this).val() === 'random');
  });
  // re-pair everyone, e.g. to include players who joined after pairing
  $('#repair-partners').on('click', function(e) {
    socket.emit('setup-partners', {'mode': $('#selectPartners').val()});
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
      // reset-game sends users without strategies, so only scored rounds extend the charts
      var total = strategy[0] + strategy[1];
      if(total > 0) {
        var outcomeCounts = [outcomes[0][0], outcomes[1][0], outcomes[1][1], outcomes[0][1]];
        totals.count += total;
        strategy.forEach(function(count, i) { totals.decisions[i] += count; });
        outcomeCounts.forEach(function(count, i) { totals.outcomes[i] += count; });
        addRound(chartDecisionTrajectory, data.round, percentages(strategy, total));
        addRound(chartOutcomeTrajectory, data.round, percentages(outcomeCounts, total));
        addRound(chartCumulativeDecisions, data.round, percentages(totals.decisions, totals.count));
        addRound(chartCumulativeOutcomes, data.round, percentages(totals.outcomes, totals.count));
        addValueRound(data.round, data.users);
      }
    }
  });
});
