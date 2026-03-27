/**
 * main.js — Game loop entry point for Dave Ball
 * Connects to the Socket.IO server, runs the 60fps render loop,
 * manages game screens (start, playing, paused, won, lost),
 * and wires up input handlers.
 * Uses global namespace pattern (no bundler required).
 *
 * Load order in HTML:
 *   1. socket.io client (CDN)
 *   2. renderer.js
 *   3. input.js
 *   4. interpolation.js
 *   5. main.js (this file)
 */
var DaveBall = DaveBall || {};

DaveBall.Main = (function () {
  'use strict';

  var Renderer = DaveBall.Renderer;
  var Input = DaveBall.Input;
  var Interp = DaveBall.Interpolation;

  // Rendering state
  var ctx = null;
  var canvas = null;

  // Socket
  var socket = null;

  // Game state from server
  var latestState = null;
  var previousState = null;
  var lastStateTime = 0;
  var serverTickInterval = 33; // ~30Hz
  var prevServerTime = null;

  // Game screen management
  // Valid states: 'start_screen', 'playing', 'paused', 'won', 'lost'
  var gameScreen = 'start_screen';
  var lastScore = 0;

  // Previous lives count for detecting life loss
  var prevLives = null;

  // Growing line tracking for sound
  var hadGrowingLines = false;

  // Frame timing for particle dt
  var lastFrameTime = null;

  // Speed multiplier (selected on start screen)
  var speedMultiplier = 1.0;
  var SPEED_MAP = { slow: 1.0, normal: 1.5, fast: 2.0 };

  // Next-level transition guard — prevents stale game_won from re-triggering
  var nextLevelRequested = false;
  var nextLevelRetryTimer = null;

  // When true, ignore incoming game_state events until a fresh state arrives
  // (prevents stale old-game data from flashing on screen during new game start)
  var awaitingFreshState = false;

  // Selected theme name (persists across levels)
  var selectedTheme = 'default';

  // Track win animation timeouts so they can be cancelled
  var winTimers = [];

  function clearWinTimers() {
    for (var i = 0; i < winTimers.length; i++) {
      clearTimeout(winTimers[i]);
    }
    winTimers = [];
  }

  // DOM overlay references
  var overlays = {};

  // High score state
  var pendingHighScoreData = null; // { score, level } awaiting initials entry
  var highlightRank = -1;         // rank to highlight in leaderboard
  var requestingLeaderboard = false; // true when we explicitly want to show leaderboard

  var nukeAnimationActive = false;  // true while nuke explosion is playing
  var nukeAnimationTimer = null;    // timeout handle for clearing the flag

  /**
   * Dispatch visual/sound effects for a captured power-up.
   * Shared by both the game_state handler and the powerup_captured socket event.
   */
  function handlePowerupEffect(pe) {
    if (pe.is_fruit) {
      Renderer.addPowerUpEffect(pe.x, pe.y, pe.kind, pe.points);
      GameSound.playFruitCollect();
      return;
    }

    Renderer.addPowerUpEffect(pe.x, pe.y, pe.kind);

    if (pe.kind === 'bomb') {
      GameSound.playBombExplode();
      if (pe.bomb_x != null && pe.bomb_y != null) {
        Renderer.addBombExplosionAt(pe.bomb_x, pe.bomb_y);
      }
    } else if (pe.kind === 'nuke') {
      GameSound.playNukeExplode();
      if (pe.blast) {
        Renderer.addNukeExplosion(pe.blast.x, pe.blast.y, pe.blast.radius);
        if (pe.blast.destroyed) {
          for (var di = 0; di < pe.blast.destroyed.length; di++) {
            var db = pe.blast.destroyed[di];
            Renderer.addBombExplosionAt(db.x, db.y);
          }
        }
      }
      Renderer.triggerShake(10, 500);
      nukeAnimationActive = true;
      clearTimeout(nukeAnimationTimer);
      nukeAnimationTimer = setTimeout(function () { nukeAnimationActive = false; }, 1500);
    } else if (pe.kind === 'shield') {
      GameSound.playShieldActivate();
    } else if (pe.kind === 'lightning') {
      GameSound.playLightningActivate();
    } else if (pe.kind === 'freeze') {
      GameSound.playFreezeActivate();
    } else if (pe.kind === 'shrink') {
      GameSound.playShrinkActivate();
    } else if (pe.kind === 'skull') {
      GameSound.playSkullCapture();
    } else if (pe.kind === 'grow') {
      GameSound.playGrowActivate();
    } else if (pe.kind === 'fusion') {
      GameSound.playFusionActivate();
    } else if (pe.kind === 'fission_pu') {
      GameSound.playFissionActivate();
    } else if (pe.kind === 'wave') {
      GameSound.playWaveActivate();
    } else if (pe.kind === 'web') {
      GameSound.playWebActivate();
    } else if (pe.kind === 'portal') {
      GameSound.playPortalActivate();
    } else if (pe.kind === 'sinkhole') {
      GameSound.playSinkholeActivate();
    } else if (pe.kind === 'snake') {
      GameSound.playSnakeActivate();
    } else if (pe.kind === 'fire') {
      GameSound.playPowerUpCollect();
    } else if (pe.kind === 'anchor') {
      GameSound.playFreezeActivate();
    } else if (pe.kind === 'jackpot') {
      GameSound.playJackpotCapture();
    } else if (pe.kind === 'mystery') {
      GameSound.playMysteryReveal();
      if (pe.resolved_kind) {
        Renderer.addMysteryRevealEffect(pe.x, pe.y, pe.resolved_kind);
        setTimeout(function (resolved) {
          return function () { Renderer.resolveMysteryText(resolved); };
        }(pe.resolved_kind), 300);
      }
    } else {
      GameSound.playPowerUpCollect();
    }
  }

  /**
   * Show a single overlay, hiding all others.
   */
  function showOverlay(name) {
    var keys = ['start', 'pause', 'gameover', 'win', 'highscore-entry', 'leaderboard', 'help'];
    for (var i = 0; i < keys.length; i++) {
      var el = overlays[keys[i]];
      if (el) {
        if (keys[i] === name) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    }
  }

  /**
   * Hide all overlays.
   */
  function hideAllOverlays() {
    showOverlay(null);
  }

  /**
   * Transition to a new game screen.
   */
  function setScreen(screen, data) {
    gameScreen = screen;

    switch (screen) {
      case 'start_screen':
        showOverlay('start');
        break;

      case 'help':
        showOverlay('help');
        break;

      case 'playing':
        hideAllOverlays();
        break;

      case 'paused':
        showOverlay('pause');
        break;

      case 'won':
        lastScore = (data && data.score) || lastScore;
        var winScoreEl = document.getElementById('win-score');
        if (winScoreEl) winScoreEl.textContent = 'Score: ' + lastScore;
        populateScoreBreakdown(data);
        showOverlay('win');
        break;

      case 'lost':
        lastScore = (data && data.score) || lastScore;
        var goScoreEl = document.getElementById('gameover-score');
        if (goScoreEl) goScoreEl.textContent = 'Score: ' + lastScore;
        showOverlay('gameover');
        break;

      case 'highscore_entry':
        showOverlay('highscore-entry');
        var hsScoreEl = document.getElementById('hs-entry-score');
        if (hsScoreEl) hsScoreEl.textContent = lastScore;
        resetInitialsInputs();
        break;

      case 'leaderboard':
        showOverlay('leaderboard');
        break;
    }
  }

  /**
   * Connect to the Socket.IO backend and set up event handlers.
   */
  function connectSocket() {
    var serverUrl = window.location.protocol + '//' + window.location.host;

    try {
      socket = io(serverUrl, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 50
      });
    } catch (e) {
      console.warn('[DaveBall] Socket.IO not available — running in offline/demo mode.');
      setDemoState();
      return;
    }

    socket.on('connect', function () {
      console.log('[DaveBall] Connected to server.');
    });

    socket.on('connect_error', function (err) {
      console.warn('[DaveBall] Connection error:', err.message);
    });

    socket.on('disconnect', function (reason) {
      console.log('[DaveBall] Disconnected from server:', reason);
    });

    socket.on('connected', function (data) {
      console.log('[DaveBall] Server handshake:', data && data.message);
    });

    // Main state update (arrives at ~30Hz)
    socket.on('game_state', function (state) {
      // Skip stale states from the old game while waiting for new game to start
      if (awaitingFreshState) {
        if (state.fill_percentage === 0 && state.growing_lines && state.growing_lines.length === 0) {
          awaitingFreshState = false;
        } else {
          return;
        }
      }

      previousState = latestState;
      latestState = state;
      lastStateTime = performance.now();

      // Compute actual tick interval from server timestamps (EMA-smoothed)
      if (state.server_time !== undefined && prevServerTime !== null) {
        var measured = (state.server_time - prevServerTime) * 1000;
        if (measured > 0 && measured < 200) {
          serverTickInterval = serverTickInterval * 0.8 + measured * 0.2;
        }
      }
      if (state.server_time !== undefined) {
        prevServerTime = state.server_time;
      }

      // Update play area shape from server
      Renderer.setShapeVertices(state.shape_vertices);

      // Track score from server
      if (state.score != null) {
        lastScore = state.score;
      }

      // Detect life loss → screen shake + sound
      if (prevLives !== null && state.lives != null && state.lives < prevLives) {
        Renderer.triggerShake(8, 350);
        flashScreen('#ff0000');
        GameSound.playLineFailed();
      }
      if (state.lives != null) {
        prevLives = state.lives;
      }

      // Manage growing line sound
      var hasGrowingLines = state.growing_lines && state.growing_lines.length > 0;
      if (hasGrowingLines && !hadGrowingLines) {
        GameSound.startLineGrowing();
      } else if (!hasGrowingLines && hadGrowingLines) {
        GameSound.stopLineGrowing();
        // Line completed successfully if no life was lost
        GameSound.playLineComplete();
      }
      hadGrowingLines = hasGrowingLines;

      // Handle ball-to-ball collisions (fission effects)
      if (state.ball_collisions && state.ball_collisions.length > 0) {
        for (var ci = 0; ci < state.ball_collisions.length; ci++) {
          var col = state.ball_collisions[ci];
          Renderer.addFissionEffect(col.x, col.y);
          GameSound.playBallFission();
        }
      }

      // Handle ball merge events (fusion power-up)
      if (state.ball_merges && state.ball_merges.length > 0) {
        for (var mi = 0; mi < state.ball_merges.length; mi++) {
          var merge = state.ball_merges[mi];
          Renderer.addMergeEffect(merge.x, merge.y);
          GameSound.playBallMerge();
        }
      }

      // Handle portal teleport events
      if (state.portal_events && state.portal_events.length > 0) {
        for (var pti = 0; pti < state.portal_events.length; pti++) {
          var tp = state.portal_events[pti];
          Renderer.addTeleportEffect(tp.from.x, tp.from.y, tp.to.x, tp.to.y);
          GameSound.playBallTeleport();
        }
      }

      // Handle sinkhole destroy events
      if (state.sinkhole_events && state.sinkhole_events.length > 0) {
        for (var shi = 0; shi < state.sinkhole_events.length; shi++) {
          var she = state.sinkhole_events[shi];
          Renderer.addSinkholeDestroyEffect(she.x, she.y);
          GameSound.playSinkholeDestroy();
        }
      }

      // Handle snake eat events
      if (state.snake_eat_events && state.snake_eat_events.length > 0) {
        for (var snei = 0; snei < state.snake_eat_events.length; snei++) {
          var sne = state.snake_eat_events[snei];
          Renderer.addSnakeEatEffect(sne.x, sne.y);
          GameSound.playSnakeEat();
        }
      }

      // Handle fire destroy events (balls burned by fire line)
      if (state.fire_destroy_events && state.fire_destroy_events.length > 0) {
        for (var fdi = 0; fdi < state.fire_destroy_events.length; fdi++) {
          var fd = state.fire_destroy_events[fdi];
          Renderer.addFireDestroyEffect(fd.x, fd.y);
        }
      }

      // Handle acid dissolve events (balls dissolved by acid pools)
      if (state.acid_dissolve_events && state.acid_dissolve_events.length > 0) {
        for (var adi = 0; adi < state.acid_dissolve_events.length; adi++) {
          var ade = state.acid_dissolve_events[adi];
          Renderer.addAcidDissolveEffect(ade.x, ade.y);
        }
      }

      // Detect ball bounces via velocity sign changes
      if (state.balls && previousState && previousState.balls) {
        detectBallBounces(previousState.balls, state.balls);
      }
      // Handle power-up capture events
      if (state.powerup_events && state.powerup_events.length > 0) {
        for (var pi = 0; pi < state.powerup_events.length; pi++) {
          handlePowerupEffect(state.powerup_events[pi]);
        }
      }

      // Sync game status from server (don't override if already moved on)
      // Clear next-level guard once the new level is actively playing
      if (state.state === 'playing' && nextLevelRequested) {
        nextLevelRequested = false;
        if (nextLevelRetryTimer) {
          clearTimeout(nextLevelRetryTimer);
          nextLevelRetryTimer = null;
        }
        console.log('[DaveBall] New level confirmed by server — nextLevelRequested cleared');
      }

      if (state.state === 'won' && gameScreen !== 'highscore_entry' && gameScreen !== 'leaderboard' && gameScreen !== 'fireworks' && gameScreen !== 'won' && gameScreen !== 'playing') {
        setScreen('won', state);
      } else if (state.state === 'lost' && gameScreen !== 'highscore_entry' && gameScreen !== 'leaderboard' && gameScreen !== 'playing') {
        setScreen('lost', state);
      }
    });

    // Line hit a ball
    socket.on('line_failed', function (data) {
      console.log('[DaveBall] Line failed!', data);
      flashScreen('#ff0000');
      Renderer.triggerShake(5, 200);
      GameSound.stopLineGrowing();
      GameSound.playLineFailed();
    });

    // A region was successfully filled
    socket.on('region_filled', function (data) {
      console.log('[DaveBall] Region filled!', data);
      flashScreen('#00ff88');
      GameSound.playRegionFilled();
    });

    // Power-up captured — backup trigger for effects
    socket.on('powerup_captured', function (data) {
      if (data) {
        handlePowerupEffect(data);
      }
    });

    // Player won the level — fireworks celebration, then show score breakdown
    socket.on('game_won', function (data) {
      if (nextLevelRequested) return; // Don't show win screen for previous level
      GameSound.stopLineGrowing();
      GameSound.stopMusic();
      GameSound.playGameWon();
      lastScore = (data && data.score) || lastScore;

      // Cancel any previous win timers
      clearWinTimers();

      // If a nuke explosion is still playing, let it finish before fireworks
      var fireworksDelay = nukeAnimationActive ? 1500 : 0;

      winTimers.push(setTimeout(function () {
        // Launch fireworks — keep rendering the game area during the show
        gameScreen = 'fireworks';
        Renderer.launchFireworks(4000,
          function () { GameSound.playFireworkLaunch(); },
          function () { GameSound.playFireworkBurst(); }
        );

        // Show win overlay early so fireworks are visible behind it
        winTimers.push(setTimeout(function () {
          if (gameScreen !== 'fireworks') return;
          populateScoreBreakdown(data);
          var winScoreEl = document.getElementById('win-score');
          if (winScoreEl) winScoreEl.textContent = 'Score: ' + lastScore;
          showOverlay('win');
          // Keep gameScreen as 'fireworks' so the render loop continues drawing them
        }, 1000));

        // After fireworks finish, transition to 'won' screen state
        winTimers.push(setTimeout(function () {
          if (gameScreen === 'fireworks') {
            gameScreen = 'won';
          }
        }, 4000));
      }, fireworksDelay));
      // NO high score check here — player keeps playing until they die
    });

    // Player lost all lives — server will send check_high_score next
    socket.on('game_lost', function (data) {
      GameSound.stopLineGrowing();
      GameSound.stopMusic();
      GameSound.playGameLost();
      gameScreen = 'lost_pending';
      lastScore = (data && data.score) || lastScore;
      var goScoreEl = document.getElementById('gameover-score');
      if (goScoreEl) goScoreEl.textContent = 'Score: ' + lastScore;
      // Don't show game over yet — wait for check_high_score from server
      // Safety: if check_high_score never arrives, show game over after 3s
      setTimeout(function () {
        if (gameScreen === 'lost_pending') {
          showOverlay('gameover');
          gameScreen = 'lost';
        }
      }, 3000);
    });

    // ── High Score Events ──

    // Server tells us this score qualifies for high score (only sent on death)
    socket.on('check_high_score', function (data) {
      if (data && data.is_high_score) {
        lastScore = data.score || lastScore;
        pendingHighScoreData = { score: lastScore, level: (latestState && latestState.level) || 1 };
        setScreen('highscore_entry');
      } else {
        // Not a high score — show normal game over
        showOverlay('gameover');
        gameScreen = 'lost';
      }
    });

    // Score was saved — show leaderboard with highlighted rank
    socket.on('score_submitted', function (data) {
      highlightRank = (data && data.rank != null) ? data.rank : -1;
      if (socket && socket.connected) {
        requestingLeaderboard = true;
        socket.emit('get_high_scores');
      }
    });

    // Receive top-10 list — handle based on context
    socket.on('high_scores', function (data) {
      var scores = (data && (data.scores || data.high_scores)) || [];

      // Explicitly requested leaderboard (from button or after submitting score)
      if (requestingLeaderboard) {
        requestingLeaderboard = false;
        populateLeaderboard(scores, highlightRank);
        setScreen('leaderboard');
      }
    });
  }

  /**
   * Provide a demo/fallback state when the server isn't available.
   */
  function setDemoState() {
    var demoBalls = [
      { x: 200, y: 150, radius: 8, color: '#ff4444', vx: 2, vy: 1.5 },
      { x: 500, y: 300, radius: 8, color: '#44aaff', vx: -1.8, vy: 2.2 }
    ];

    latestState = {
      balls: demoBalls,
      boundaries: [],
      growing_lines: [],
      filled_regions: [],
      lives: 3,
      score: 0,
      fillPercent: 0,
      level: 1,
      state: 'playing'
    };

    // Simple offline ball animation for demo mode
    setInterval(function () {
      if (!latestState || gameScreen !== 'playing') return;
      previousState = JSON.parse(JSON.stringify(latestState));

      for (var i = 0; i < latestState.balls.length; i++) {
        var b = latestState.balls[i];
        b.x += b.vx;
        b.y += b.vy;

        if (b.x - b.radius <= 0 || b.x + b.radius >= Renderer.PLAY_WIDTH) {
          b.vx = -b.vx;
          b.x = Math.max(b.radius, Math.min(Renderer.PLAY_WIDTH - b.radius, b.x));
        }
        if (b.y - b.radius <= 0 || b.y + b.radius >= Renderer.PLAY_HEIGHT) {
          b.vy = -b.vy;
          b.y = Math.max(b.radius, Math.min(Renderer.PLAY_HEIGHT - b.radius, b.y));
        }
      }

      lastStateTime = performance.now();
    }, serverTickInterval);
  }

  /**
   * Brief screen flash for feedback events.
   */
  var flashColor = null;
  var flashUntil = 0;

  function flashScreen(color) {
    flashColor = color;
    flashUntil = performance.now() + 150;
  }

  /**
   * Detect ball bounces by comparing velocity sign changes.
   * Throttled to max one bounce sound per frame.
   */
  function detectBallBounces(prevBalls, currBalls) {
    if (!prevBalls || !currBalls) return;
    var bounced = false;
    var len = Math.min(prevBalls.length, currBalls.length);
    for (var i = 0; i < len; i++) {
      var pb = prevBalls[i];
      var cb = currBalls[i];
      if (pb.vx == null || cb.vx == null) continue;
      if ((pb.vx > 0 && cb.vx < 0) || (pb.vx < 0 && cb.vx > 0) ||
          (pb.vy > 0 && cb.vy < 0) || (pb.vy < 0 && cb.vy > 0)) {
        bounced = true;
        break;
      }
    }
    if (bounced) {
      GameSound.playBallBounce();
    }
  }

  /**
   * Send a line-start event to the server.
   */
  function onLineStart(e) {
    if (gameScreen !== 'playing') return;
    GameSound.playLineStart();

    var detail = e.detail;
    if (socket && socket.connected) {
      socket.emit('line_start', {
        x: detail.x,
        y: detail.y,
        direction: detail.direction
      });
    } else {
      console.log('[DaveBall] Line start (offline):', detail);
    }
  }

  /**
   * Compute interpolation factor between server states.
   */
  function getInterpolationT() {
    if (!lastStateTime) return 1;
    var elapsed = performance.now() - lastStateTime;
    return Math.min(elapsed / serverTickInterval, 1);
  }

  /**
   * Main render loop — called every frame via requestAnimationFrame.
   */
  function gameLoop(timestamp) {
    requestAnimationFrame(gameLoop);

    var now = timestamp || performance.now();

    // Update renderer frame time for animations
    Renderer.setFrameTime(now);

    // Compute frame delta (seconds) for particle updates
    var dt = lastFrameTime ? (now - lastFrameTime) / 1000 : 0.016;
    if (dt > 0.1) dt = 0.016; // clamp large gaps
    lastFrameTime = now;

    // Update fission particles
    Renderer.updateParticles(dt);

    // Update fireworks
    Renderer.updateFireworks(dt);

    // Music intensity: constant during gameplay, calm on start screen
    if (gameScreen === 'playing') {
      GameSound.setMusicIntensity(1);
    } else if (gameScreen === 'start_screen') {
      GameSound.setMusicIntensity(0);
    }

    // Clear (applies screen shake)
    Renderer.clearCanvas(ctx);

    // Draw play area border with glow
    Renderer.drawPlayArea(ctx, latestState);

    if (latestState && gameScreen === 'playing') {
      // Interpolate ball positions
      var t = getInterpolationT();
      var renderBalls = Interp.interpolateBalls(
        previousState ? previousState.balls : null,
        latestState.balls,
        t
      );

      // Draw web zones (before balls, so balls appear on top)
      if (latestState.web_zones) {
        Renderer.drawWebZones(ctx, latestState.web_zones);
      }

      // Draw portal pair (before balls)
      if (latestState.portal_pair) {
        Renderer.drawPortals(ctx, latestState.portal_pair);
      }

      // Draw sinkhole (before balls, so balls appear on top)
      if (latestState.sinkhole) {
        Renderer.drawSinkhole(ctx, latestState.sinkhole);
      }

      // Draw magnet (before balls, so balls appear on top)
      if (latestState.magnet) {
        Renderer.drawMagnet(ctx, latestState.magnet);
      }

      // Draw game elements
      if (latestState.obstacles) {
        Renderer.drawObstacles(ctx, latestState.obstacles);
      }
      Renderer.drawFilledRegions(ctx, latestState.filled_regions);

      // Red danger overlay when on last life (drawn AFTER fills so it covers everything)
      Renderer.drawDangerOverlay(ctx, latestState ? latestState.lives : 3);

      Renderer.drawBoundaries(ctx, latestState.boundaries, latestState.obstacles);
      Renderer.drawGrowingLines(ctx, latestState.growing_lines);
      Renderer.drawBalls(ctx, renderBalls);

      // Draw snake (after balls, so snake appears on top)
      if (latestState.snake) {
        Renderer.drawSnake(ctx, latestState.snake);
      }

      // Draw acid pools (after balls, so pools appear on top)
      if (latestState.acid_pools && latestState.acid_pools.length > 0) {
        Renderer.drawAcidPools(ctx, latestState.acid_pools);
      }

      // Draw power-up items (after balls, before HUD)
      Renderer.drawPowerUps(ctx, latestState.powerups);

      // Blue slow-motion overlay
      Renderer.drawSlowOverlay(ctx, !!latestState.is_slowed);

      // Active power-up effect overlays
      Renderer.drawShieldOverlay(ctx, !!latestState.shield_active);
      Renderer.drawLightningOverlay(ctx, !!latestState.lightning_active);
      Renderer.drawFreezeOverlay(ctx, !!latestState.is_frozen);
      Renderer.drawShrinkOverlay(ctx, !!latestState.is_shrunk);
      Renderer.drawGrowOverlay(ctx, !!latestState.is_grown);
      // Fusion overlay removed — no border animation
      Renderer.drawFissionOverlay(ctx, !!latestState.is_fission_active);
      Renderer.drawWaveOverlay(ctx, !!latestState.is_wave);

      // HUD
      Renderer.drawHUD(ctx, {
        lives: latestState.lives,
        score: latestState.score,
        fillPercent: latestState.fill_percentage,
        level: latestState.level,
        levelTimer: latestState.level_timer
      });

      // Fission particle effects (drawn above game elements)
      Renderer.drawParticles(ctx);

      // Power-up capture effects (particles + floating text)
      Renderer.drawPowerUpEffects(ctx);

      // Portal/teleport particle effects
      Renderer.updateAndDrawTeleportParticles(ctx, dt);

      // Sinkhole ambient particle effects
      Renderer.updateAndDrawSinkholeParticles(ctx, dt);

      // Direction indicator at cursor
      var mousePos = Input.getMousePos();
      if (mousePos.x >= 0 && mousePos.y >= 0) {
        Renderer.drawDirectionIndicator(ctx, mousePos, Input.getDirection(),
          !!latestState.shield_active, !!latestState.lightning_active, !!latestState.fire_active);
      }

      // Screen flash
      if (flashColor && performance.now() < flashUntil) {
        var flashAlpha = 0.2 * ((flashUntil - performance.now()) / 150);
        ctx.fillStyle = flashColor;
        ctx.globalAlpha = flashAlpha;
        ctx.fillRect(0, Renderer.PLAY_Y_OFFSET, Renderer.PLAY_WIDTH, Renderer.PLAY_HEIGHT);
        ctx.globalAlpha = 1.0;
      }
    } else if (latestState && gameScreen === 'paused') {
      // Render frozen frame while paused
      if (latestState.obstacles) {
        Renderer.drawObstacles(ctx, latestState.obstacles);
      }
      Renderer.drawFilledRegions(ctx, latestState.filled_regions);
      Renderer.drawBoundaries(ctx, latestState.boundaries, latestState.obstacles);
      Renderer.drawBalls(ctx, latestState.balls);
      Renderer.drawHUD(ctx, {
        lives: latestState.lives,
        score: latestState.score,
        fillPercent: latestState.fill_percentage,
        level: latestState.level,
        levelTimer: latestState.level_timer
      });
    } else if (latestState && gameScreen === 'fireworks') {
      // Render frozen game scene during fireworks celebration
      if (latestState.obstacles) {
        Renderer.drawObstacles(ctx, latestState.obstacles);
      }
      Renderer.drawFilledRegions(ctx, latestState.filled_regions);
      Renderer.drawBoundaries(ctx, latestState.boundaries, latestState.obstacles);
      Renderer.drawBalls(ctx, latestState.balls);
      Renderer.drawHUD(ctx, {
        lives: latestState.lives,
        score: latestState.score,
        fillPercent: latestState.fill_percentage,
        level: latestState.level,
        levelTimer: latestState.level_timer
      });
      // Fireworks overlay on top of the frozen scene
      Renderer.drawFireworks(ctx);
    } else {
      // No state or on a menu — draw empty HUD
      Renderer.drawHUD(ctx, {});
    }

    // Reset canvas transform (undo shake for next frame)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Set up keyboard handlers (ESC for pause).
   */
  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Spacebar toggles line direction (same as right-click)
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        if (gameScreen === 'playing' && Input) {
          Input.toggleDirection();
        }
        return;
      }

      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();

        if (gameScreen === 'playing') {
          setScreen('paused');
          GameSound.stopMusic();
          if (socket && socket.connected) {
            socket.emit('pause_game');
          }
        } else if (gameScreen === 'paused') {
          setScreen('playing');
          GameSound.startMusic();
          if (socket && socket.connected) {
            socket.emit('unpause_game');
          }
        }
      }
    });
  }

  /**
   * Read the selected speed from the speed-selector buttons.
   */
  function readSelectedSpeed() {
    var selected = document.querySelector('.speed-btn.selected');
    var key = selected ? selected.getAttribute('data-speed') : 'normal';
    speedMultiplier = SPEED_MAP[key] || 1.0;
  }

  /**
   * Set up speed selector toggle behavior.
   */
  function initSpeedSelector() {
    var buttons = document.querySelectorAll('.speed-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].classList.remove('selected');
        }
        this.classList.add('selected');
      });
    }
  }

  /**
   * Apply theme CSS custom properties to the game container.
   */
  function applyThemeCSS(themeName) {
    var theme = Renderer.THEMES[themeName] || Renderer.THEMES['default'];
    var container = document.getElementById('game-container');
    if (!container) return;

    var rgb = hexToRgbCSS(theme.accent);
    container.style.setProperty('--accent-color', theme.accent);
    container.style.setProperty('--accent-rgb', rgb);
    container.style.setProperty('--bg-color', theme.hudBg);
  }

  /**
   * Convert hex color to "r, g, b" string for CSS rgba().
   */
  function hexToRgbCSS(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substring(0, 2), 16);
    var g = parseInt(hex.substring(2, 4), 16);
    var b = parseInt(hex.substring(4, 6), 16);
    return r + ', ' + g + ', ' + b;
  }

  /**
   * Read and apply the selected theme.
   */
  function readSelectedTheme() {
    var selected = document.querySelector('.theme-btn.selected');
    var key = selected ? selected.getAttribute('data-theme') : 'default';
    selectedTheme = key;
    Renderer.setTheme(selectedTheme);
    GameSound.setMusicTheme(selectedTheme);
    applyThemeCSS(selectedTheme);
  }

  /**
   * Set up theme selector toggle behavior with live preview.
   */
  function initThemeSelector() {
    var buttons = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].classList.remove('selected');
        }
        this.classList.add('selected');
        readSelectedTheme();
      });
    }
  }

  function initButtons() {
    var btnStart = document.getElementById('btn-start');
    var btnRetry = document.getElementById('btn-retry');
    var btnNext = document.getElementById('btn-next');

    if (btnStart) {
      btnStart.addEventListener('click', function () {
        GameSound.playButtonClick();
        readSelectedSpeed();
        setScreen('playing');
        prevLives = null;
        hadGrowingLines = false;
        Renderer.resetRegionFades();
        latestState = null;
        previousState = null;
        awaitingFreshState = true;
        GameSound.startMusic();
        if (socket && socket.connected) {
          socket.emit('start_game', { speed_multiplier: speedMultiplier });
        } else {
          setDemoState();
        }
      });
    }

    if (btnRetry) {
      btnRetry.addEventListener('click', function () {
        GameSound.playButtonClick();
        readSelectedSpeed();
        setScreen('playing');
        prevLives = null;
        hadGrowingLines = false;
        Renderer.resetRegionFades();
        latestState = null;
        previousState = null;
        awaitingFreshState = true;
        GameSound.startMusic();
        if (socket && socket.connected) {
          socket.emit('start_game', { speed_multiplier: speedMultiplier });
        } else {
          setDemoState();
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', function (e) {
        e.stopPropagation();
        GameSound.playButtonClick();
        clearWinTimers();
        setScreen('playing');
        prevLives = null;
        hadGrowingLines = false;
        Renderer.resetRegionFades();
        var currentLevel = (latestState && latestState.level) || 1;
        var currentScore = lastScore || 0;
        latestState = null;
        previousState = null;
        GameSound.startMusic();
        if (socket && socket.connected) {
          socket.emit('start_game', {
            speed_multiplier: speedMultiplier,
            continue_level: currentLevel + 1,
            continue_score: currentScore
          });
        } else if (socket) {
          socket.connect();
          socket.once('connect', function() {
            socket.emit('start_game', {
              speed_multiplier: speedMultiplier,
              continue_level: currentLevel + 1,
              continue_score: currentScore
            });
          });
        }
      });
    }

    // Mute button
    var btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      btnMute.addEventListener('click', function () {
        var nowMuted = GameSound.toggleMute();
        btnMute.textContent = nowMuted ? '🔇' : '🔊';
      });
    }

    // High Scores button on start screen
    var btnHighScores = document.getElementById('btn-highscores');
    if (btnHighScores) {
      btnHighScores.addEventListener('click', function () {
        GameSound.playButtonClick();
        highlightRank = -1;
        requestingLeaderboard = true;
        if (socket && socket.connected) {
          socket.emit('get_high_scores');
        } else {
          // Offline — show empty leaderboard
          populateLeaderboard([], -1);
          setScreen('leaderboard');
        }
      });
    }

    // How to Play button on start screen
    var btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
      btnHelp.addEventListener('click', function () {
        GameSound.playButtonClick();
        setScreen('help');
      });
    }

    // Back button on help screen
    var btnHelpBack = document.getElementById('btn-help-back');
    if (btnHelpBack) {
      btnHelpBack.addEventListener('click', function () {
        GameSound.playButtonClick();
        setScreen('start_screen');
      });
    }

    // Submit Score button
    var btnSubmit = document.getElementById('btn-submit-score');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', function () {
        if (this.disabled) return;
        GameSound.playButtonClick();
        var initials = '';
        for (var i = 0; i < 3; i++) {
          var inp = document.getElementById('hs-init-' + i);
          initials += inp ? inp.value.toUpperCase() : '';
        }
        var scoreData = {
          initials: initials,
          score: lastScore,
          level: (pendingHighScoreData && pendingHighScoreData.level) ||
                 (latestState && latestState.level) || 1
        };
        if (socket && socket.connected) {
          socket.emit('submit_score', scoreData);
        }
      });
    }

    // Leaderboard Play Again button
    var btnLBPlay = document.getElementById('btn-leaderboard-play');
    if (btnLBPlay) {
      btnLBPlay.addEventListener('click', function () {
        GameSound.playButtonClick();
        readSelectedSpeed();
        setScreen('playing');
        prevLives = null;
        hadGrowingLines = false;
        pendingHighScoreData = null;
        highlightRank = -1;
        Renderer.resetRegionFades();
        latestState = null;
        previousState = null;
        GameSound.startMusic();
        if (socket && socket.connected) {
          socket.emit('start_game', { speed_multiplier: speedMultiplier });
        } else {
          setDemoState();
        }
      });
    }

    // Main Menu buttons (game over + leaderboard)
    var menuButtons = [
      document.getElementById('btn-gameover-menu'),
      document.getElementById('btn-leaderboard-menu')
    ];
    for (var mi = 0; mi < menuButtons.length; mi++) {
      if (menuButtons[mi]) {
        menuButtons[mi].addEventListener('click', function () {
          GameSound.playButtonClick();
          GameSound.stopMusic();
          setScreen('start_screen');
          latestState = null;
          previousState = null;
          pendingHighScoreData = null;
          highlightRank = -1;
        });
      }
    }
  }

  /**
   * Populate and animate the score breakdown table on the win screen.
   */
  function populateScoreBreakdown(data) {
    var container = document.getElementById('score-breakdown');
    if (!container) return;

    var breakdown = (data && data.level_score_breakdown) ||
                    (latestState && latestState.level_score_breakdown) || null;

    if (!breakdown) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    var rows = [
      { icon: '\u23F1', label: 'Time Bonus', key: 'time_bonus' },
      { icon: '\u2665', label: 'Lives Bonus', key: 'lives_bonus' },
      { icon: '\u2702', label: 'Efficiency Bonus', key: 'efficiency_bonus' },
      { icon: '\u25A0', label: 'Fill Bonus', key: 'fill_bonus' }
    ];

    var tbody = container.querySelector('.breakdown-rows');
    var totalEl = container.querySelector('.breakdown-total-value');
    if (!tbody || !totalEl) return;

    // Clear previous rows
    tbody.textContent = '';
    totalEl.textContent = '';

    // Build rows hidden, then reveal with staggered animation
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var val = breakdown[r.key] != null ? breakdown[r.key] : 0;

      var row = document.createElement('div');
      row.className = 'breakdown-row';
      row.style.animationDelay = (i * 0.18) + 's';

      var labelSpan = document.createElement('span');
      labelSpan.className = 'breakdown-label';
      labelSpan.textContent = r.icon + ' ' + r.label;

      var valueSpan = document.createElement('span');
      valueSpan.className = 'breakdown-value';
      valueSpan.textContent = '+' + val;

      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      tbody.appendChild(row);
    }

    // Total line appears after all rows
    var totalDelay = rows.length * 0.18 + 0.15;
    var totalRow = container.querySelector('.breakdown-total');
    if (totalRow) {
      totalRow.style.animationDelay = totalDelay + 's';
      totalRow.classList.remove('breakdown-reveal');
      // Force reflow to restart animation
      void totalRow.offsetWidth;
      totalRow.classList.add('breakdown-reveal');
    }

    var totalVal = breakdown.total != null ? breakdown.total : 0;
    totalEl.textContent = '+' + totalVal;
  }

  /**
   * Reset the 3 initial-entry inputs and disable submit.
   */
  function resetInitialsInputs() {
    for (var i = 0; i < 3; i++) {
      var inp = document.getElementById('hs-init-' + i);
      if (inp) { inp.value = ''; }
    }
    var btn = document.getElementById('btn-submit-score');
    if (btn) btn.disabled = true;
    // Auto-focus first input
    var first = document.getElementById('hs-init-0');
    if (first) setTimeout(function () { first.focus(); }, 100);
  }

  /**
   * Check if all 3 initials are filled → enable/disable submit.
   */
  function checkInitialsFilled() {
    var filled = true;
    for (var i = 0; i < 3; i++) {
      var inp = document.getElementById('hs-init-' + i);
      if (!inp || !inp.value) { filled = false; break; }
    }
    var btn = document.getElementById('btn-submit-score');
    if (btn) btn.disabled = !filled;
  }

  /**
   * Wire up the 3 initial-entry inputs with auto-advance/backspace behavior.
   */
  function initInitialsInputs() {
    for (var idx = 0; idx < 3; idx++) {
      (function (i) {
        var inp = document.getElementById('hs-init-' + i);
        if (!inp) return;

        inp.addEventListener('input', function () {
          // Force uppercase A-Z only
          var val = this.value.replace(/[^A-Za-z]/g, '').toUpperCase();
          this.value = val ? val.charAt(0) : '';
          if (this.value && i < 2) {
            var next = document.getElementById('hs-init-' + (i + 1));
            if (next) next.focus();
          }
          checkInitialsFilled();
        });

        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace') {
            if (!this.value && i > 0) {
              e.preventDefault();
              var prev = document.getElementById('hs-init-' + (i - 1));
              if (prev) { prev.value = ''; prev.focus(); }
            }
            checkInitialsFilled();
          }
          // Allow Enter to submit if ready
          if (e.key === 'Enter') {
            var btn = document.getElementById('btn-submit-score');
            if (btn && !btn.disabled) btn.click();
          }
        });

        // Select all on focus for easy overwrite
        inp.addEventListener('focus', function () { this.select(); });
      })(idx);
    }
  }

  /**
   * Populate the leaderboard table with up to 10 entries.
   */
  function populateLeaderboard(scores, highlightIdx) {
    var tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;
    tbody.textContent = '';

    for (var i = 0; i < 10; i++) {
      var tr = document.createElement('tr');
      var entry = scores[i];
      var rank = i + 1;

      var tdRank = document.createElement('td');
      tdRank.textContent = rank + '.';
      tr.appendChild(tdRank);

      if (entry) {
        var tdInitials = document.createElement('td');
        tdInitials.textContent = entry.initials || '---';
        tr.appendChild(tdInitials);

        var tdScore = document.createElement('td');
        tdScore.textContent = entry.score != null ? entry.score : 0;
        tr.appendChild(tdScore);

        var tdLevel = document.createElement('td');
        tdLevel.textContent = entry.level != null ? entry.level : '-';
        tr.appendChild(tdLevel);

        if (rank === highlightIdx) {
          tr.className = 'lb-highlight';
        }
      } else {
        tr.className = 'lb-empty';
        var tdEmpty1 = document.createElement('td');
        tdEmpty1.textContent = '---';
        tr.appendChild(tdEmpty1);

        var tdEmpty2 = document.createElement('td');
        tdEmpty2.textContent = '---';
        tr.appendChild(tdEmpty2);

        var tdEmpty3 = document.createElement('td');
        tdEmpty3.textContent = '-';
        tr.appendChild(tdEmpty3);
      }
      tbody.appendChild(tr);
    }
  }

  /**
   * Cache overlay DOM references.
   */
  function initOverlays() {
    overlays.start = document.getElementById('overlay-start');
    overlays.pause = document.getElementById('overlay-pause');
    overlays.gameover = document.getElementById('overlay-gameover');
    overlays.win = document.getElementById('overlay-win');
    overlays['highscore-entry'] = document.getElementById('overlay-highscore-entry');
    overlays.leaderboard = document.getElementById('overlay-leaderboard');
    overlays.help = document.getElementById('overlay-help');
  }

  /**
   * Initialize everything and start the game loop.
   */
  function init() {
    // Set up canvas
    var setup = Renderer.initCanvas('game-canvas');
    ctx = setup.ctx;
    canvas = setup.canvas;

    // Set up overlays
    initOverlays();

    // Set up input
    Input.initInput(canvas);

    // Keyboard (ESC to pause)
    initKeyboard();

    // Speed selector
    initSpeedSelector();

    // Theme selector
    initThemeSelector();
    applyThemeCSS('default');

    // Overlay buttons
    initButtons();

    // High score initials input wiring
    initInitialsInputs();

    // Listen for line-start events from input module
    canvas.addEventListener('line-start', onLineStart);

    // Connect to server
    connectSocket();

    // Show start screen
    setScreen('start_screen');

    // Start render loop
    console.log('[DaveBall] Starting render loop at 60fps.');
    requestAnimationFrame(gameLoop);
  }

  // Public API
  return {
    init: init,
    isConnected: function () { return socket && socket.connected; }
  };
})();

// Auto-start when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
  DaveBall.Main.init();
});
