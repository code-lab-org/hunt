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

  function decode(text) {
    // user names arrive HTML-escaped; decode them and insert as text only
    return $('<textarea>').html(text).text();
  }

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
        var name = decode(user.user);
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
  // the admin session token survives reloads within this tab
  var adminToken = null;
  var signedIn = false;
  var replaced = false;
  try {
    adminToken = sessionStorage.getItem('hunt-admin-token');
  } catch(e) {}
  function saveToken(token) {
    adminToken = token;
    try {
      if(token) {
        sessionStorage.setItem('hunt-admin-token', token);
      } else {
        sessionStorage.removeItem('hunt-admin-token');
      }
    } catch(e) {}
  }
  function showLogin(message) {
    signedIn = false;
    setReady(false);
    $('#nav-info').addClass('d-none');
    $('#nav-login').removeClass('d-none');
    $('#login-error').text(message || '');
    loginModal.show();
  }
  // the server only accepts admin actions once this connection has signed in, so actions
  // can't ride socket.io's reconnect buffer; setup changes made meanwhile are sent afterwards
  var ready = false;
  var pendingSetup = {};
  function adminEmit(event, data) {
    if(ready) {
      socket.emit(event, data);
    } else if(event === 'setup-payoffs' || event === 'setup-partners') {
      pendingSetup[event] = data;
    }
  }
  function setReady(value) {
    ready = value;
    $('#score-game, #execute-game, #reset-game, #export-results').prop('disabled', !value);
    if(value) {
      Object.keys(pendingSetup).forEach(function(event) {
        socket.emit(event, pendingSetup[event]);
      });
      pendingSetup = {};
    }
  }
  setReady(false);
  $('#login').on('submit', function(e) {
      e.preventDefault();
      replaced = false;
      socket.emit('login-admin', {
        'password': $('#inputPassword').val()
      });
  });
  socket.on('connect', function() {
    // resume after a reload or dropped connection; otherwise ask for the password
    if(adminToken && !replaced) {
      socket.emit('resume-admin', {'token': adminToken});
    } else if(!signedIn) {
      showLogin();
    }
  });
  socket.on('disconnect', function() {
    setReady(false);
    // the server cancels the players' countdown when the admin drops, so end the run too
    if(execution) {
      stopExecution();
    }
    if(signedIn) {
      $('#connection-alert').removeClass('d-none');
    }
  });
  socket.on('login-auth', function(data) {
    if(data.success) {
      signedIn = true;
      saveToken(data.token);
      setReady(true);
      $('#nav-login').addClass('d-none')
      $('#info').text('admin');
      $('#nav-info').removeClass('d-none');
      $('#connection-alert').addClass('d-none');
      $('#login-error').text('');
      loginModal.hide();
    } else {
      $('#login-error').text(data.message);
    }
  });
  socket.on('resume-failed', function() {
    saveToken(null);
    $('#connection-alert').addClass('d-none');
    showLogin('Your session has expired. Please sign in again.');
  });
  socket.on('session-replaced', function() {
    // the dashboard continues in another tab or window
    replaced = true;
    if(execution) {
      stopExecution();
    }
    showLogin('The dashboard is open in another tab or window.');
  });
  // resetting can't be undone, so confirm first
  $('#reset-game').on('click', function(e) {
    bootstrap.Modal.getOrCreateInstance('#reset').show();
  });
  $('#reset-confirm').on('click', function(e) {
    bootstrap.Modal.getOrCreateInstance('#reset').hide();
    if(execution) {
      stopExecution();
    }
    adminEmit('reset-game');
    clearRounds();
  });
  $('#score-game').on('click', function(e) {
    adminEmit('score-game');
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
    // players see the same countdown
    adminEmit('countdown', {'remaining': delay});
    // a manual score would add an unplanned round to the run
    $('#score-game').prop('disabled', true);
    tickExecution();
  });
  function tickExecution() {
    // score every round that is due, then wake at the next whole second of the countdown
    while(execution && Date.now() >= execution.nextAt) {
      execution.round += 1;
      adminEmit('score-game');
      if(execution.round >= execution.rounds) {
        stopExecution();
      } else {
        execution.nextAt = Date.now() + execution.delay;
        adminEmit('countdown', {'remaining': execution.delay});
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
    adminEmit('countdown', {'remaining': 0});
    $('#score-game').prop('disabled', !ready);
    $('#execute-game').removeAttr('title').text('Execute...');
  }
  // apply setup as soon as a value is committed (change fires on enter/blur, not every keystroke)
  $('table.simple input, table.complex input, #probCollab').on('change', function(e) {
    updatePayoffs();
  });
  $('#selectPartners').on('change', function(e) {
    adminEmit('setup-partners', {'mode': $(this).val()});
    // re-pairing only matters when players are paired with each other
    $('#repair-partners').prop('disabled', $(this).val() === 'random');
  });
  // re-pair everyone, e.g. to include players who joined after pairing
  $('#repair-partners').on('click', function(e) {
    adminEmit('setup-partners', {'mode': $('#selectPartners').val()});
  });
  function validField(id, isValid) {
    // highlight boxes the server would ignore; it keeps the last valid values
    var value = $(id).val();
    var valid = value !== '' && isValid(Number(value));
    $(id).toggleClass('is-invalid', !valid);
    return valid;
  }
  function updatePayoffs() {
    var simple = $('#modeSelect').val() === 'simple';
    $('table.simple').toggle(simple);
    $('table.complex').toggle(!simple);
    var ids = simple ? ['SS', 'SH', 'HS', 'HH']
      : ['A', 'B', 'C', 'D'].flatMap(function(tool) {
        return ['SS', 'SH', 'HS', 'HH'].map(function(cell) { return tool + '-' + cell; });
      });
    // check every box (not just up to the first bad one) so all are highlighted
    var payoffsValid = ids.map(function(id) { return validField('#' + id, Number.isFinite); })
      .every(Boolean);
    var probValid = validField('#probCollab', function(p) { return p >= 0 && p <= 1; });
    $('#payoff-error').toggleClass('d-none', payoffsValid);
    var data = {};
    if(payoffsValid && simple) {
      data.payoffs = [
        [$('#SS').val(), $('#SH').val()],
        [$('#HS').val(), $('#HH').val()]
      ];
    } else if(payoffsValid) {
      data.payoffs = {
        "A": [[$('#A-SS').val(), $('#A-SH').val()], [$('#A-HS').val(), $('#A-HH').val()]],
        "B": [[$('#B-SS').val(), $('#B-SH').val()], [$('#B-HS').val(), $('#B-HH').val()]],
        "C": [[$('#C-SS').val(), $('#C-SH').val()], [$('#C-HS').val(), $('#C-HH').val()]],
        "D": [[$('#D-SS').val(), $('#D-SH').val()], [$('#D-HS').val(), $('#D-HH').val()]]
      };
    }
    if(probValid) {
      data.probCollab = $('#probCollab').val();
    }
    adminEmit('setup-payoffs', data);
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
    // values from the server are valid
    $('table.simple input, table.complex input, #probCollab').removeClass('is-invalid');
    $('#payoff-error').addClass('d-none');
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
  socket.on('players-updated', function(data) {
    // everyone signed in, including players waiting to reconnect
    var tbody = $('#scoreboard table tbody').empty();
    data.users.forEach(function(player, i) {
      var name = $('<td>').text(decode(player.user));
      if(!player.connected) {
        name.append(' ', $('<span class="badge text-bg-warning">').text('reconnecting'));
      }
      tbody.append($('<tr>').append(
        $('<td>').text(i + 1),
        name,
        $('<td>').text(player.score.toLocaleString(undefined, { maximumFractionDigits: 2 }))
      ));
    });
    var waiting = data.users.filter(function(player) { return !player.connected; }).length;
    var connected = data.users.length - waiting;
    $('#players-summary').text(data.users.length === 0 ? 'No players have joined yet.'
      : connected + (connected === 1 ? ' player' : ' players') + ' connected'
        + (waiting ? ' · ' + waiting + ' reconnecting' : ''));
  });
  // rounds since the last reset, sent when the dashboard signs in (e.g. after a reload)
  socket.on('game-history', function(data) {
    clearRounds();
    data.rounds.forEach(addScoredRound);
  });
  socket.on('partners-changed', function(data) {
    $('#selectPartners').val(data.mode);
    $('#repair-partners').prop('disabled', data.mode === 'random');
  });
  $('#export-results').on('click', function(e) {
    adminEmit('export-results');
  });
  socket.on('export-results', function(data) {
    // the byte-order mark tells spreadsheet apps the file is UTF-8
    var blob = new Blob(['﻿' + data.csv], {type: 'text/csv;charset=utf-8'});
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'hunt-results-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.csv';
    link.click();
    setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
  });
  socket.on('score-updated', addScoredRound);
  function addScoredRound(data) {
    if(data.users) {
      var strategy = [0, 0]; // S, H
      var outcomes = [[0, 0], [0, 0]] // SS, SH, HS, HH
      for(var i=0; i < data.users.length; i++) {
        if(data.users[i].strategy) {
          strategy[data.users[i].strategy === 'stag' ? 0 : 1] += 1;
          outcomes[data.users[i].strategy === 'stag' ? 0 : 1][data.users[i].partnerStrategy === 'stag' ? 0 : 1] += 1;
        }
      }
      // a round scored with no players doesn't extend the charts
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
  }
});
