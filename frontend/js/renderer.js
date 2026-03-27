/**
 * renderer.js — Canvas drawing module for Dave Ball game
 * Uses global namespace pattern (no bundler required).
 */
var DaveBall = DaveBall || {};

DaveBall.Renderer = (function () {
  'use strict';

  var CANVAS_WIDTH = 800;
  var CANVAS_HEIGHT = 650;
  var HUD_HEIGHT = 50;
  var PLAY_WIDTH = 800;
  var PLAY_HEIGHT = 600;
  var PLAY_Y_OFFSET = HUD_HEIGHT;

  // Current level shape polygon (set from main.js via setShapeVertices)
  var currentShapeVertices = null;

  // Animation clock (set each frame from main.js)
  var frameTime = 0;

  // Screen-shake state
  var shakeX = 0;
  var shakeY = 0;
  var shakeUntil = 0;
  var shakeIntensity = 0;

  // Region fade-in tracking: region index → first-seen timestamp
  var regionFadeMap = {};
  var REGION_FADE_DURATION = 400; // ms

  // Danger overlay state (last-life red background)
  var dangerLevel = 0;
  var lastDangerFrameTime = 0;

  // ── Fission particle system ──
  var MAX_PARTICLES = 200;
  var particles = [];
  var FISSION_COLORS = ['#ffffff', '#fffbe6', '#ffe066', '#ffaa00', '#ff6600'];

  // Flash/glow rings at collision points
  var fissionFlashes = [];

  // Power-up capture effect particles and floating text
  var powerUpParticles = [];
  var powerUpTexts = [];
  var HEART_COLORS = ['#ff4466', '#ff6699', '#ff88aa', '#ffffff', '#ffccdd'];
  var CLOCK_COLORS = ['#44ccff', '#66ddff', '#00aaff', '#ffffff', '#88eeff'];
  var SHIELD_COLORS = ['#4488ff', '#88aaff', '#aaccff', '#ffffff', '#c0d8ff'];
  var LIGHTNING_COLORS = ['#ffee44', '#ffdd00', '#ffcc00', '#ffffff', '#ffff88'];
  var BOMB_COLORS = ['#ff6600', '#ff4400', '#ff2200', '#ffaa00', '#ff8800'];
  var MYSTERY_COLORS = ['#ff44ff', '#44ff44', '#4444ff', '#ffff44', '#44ffff'];
  var FREEZE_COLORS = ['#ffffff', '#ccf2ff', '#88e8ff', '#aaf0ff', '#ddf8ff'];
  var SHRINK_COLORS = ['#cc66ff', '#aa44dd', '#dd88ff', '#ffffff', '#bb55ee'];
  var SKULL_COLORS = ['#cc0000', '#880000', '#440000', '#ff2222', '#220000'];
  var GROW_COLORS = ['#ff6600', '#ff4400', '#ff8800', '#ffaa00', '#cc3300'];
  var FUSION_COLORS = ['#ffcc00', '#ffaa22', '#dd8800', '#ffdd55', '#ffffff'];
  var WEB_COLORS = ['#ffffff', '#dddddd', '#cccccc', '#eeeeee', '#bbbbbb'];
  var PORTAL_COLORS = ['#aa44ff', '#7722cc', '#cc66ff', '#9933ee', '#dd88ff'];
  var SINKHOLE_COLORS = ['#440066', '#220033', '#6600aa', '#330055', '#110022'];
  var JACKPOT_COLORS = ['#ffd700', '#ffec80', '#ffaa00', '#ffffff', '#ffe44d', '#ffcc00'];
  var SNAKE_COLORS = ['#22cc44', '#33ff55', '#118833', '#44ff66', '#00aa22'];
  var MAGNET_COLORS = ['#cc2222', '#ff4444', '#bbbbbb', '#dddddd', '#ff6666'];
  var NUKE_COLORS = ['#ffffff', '#ffffaa', '#ffee44', '#ffcc00', '#ffaa00', '#ff6600'];
  var FISSION_PU_COLORS = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#cc2200'];
  var WAVE_COLORS_PU = ['#0088cc', '#00aadd', '#22ccee', '#44ddff', '#0066aa'];
  var FRUIT_COLORS = ['#ffdd44', '#ffcc00', '#ffee66', '#ffffff', '#ffaa22'];
  var FIRE_COLORS = ['#ff4500', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00', '#ff2200'];
  var ACID_COLORS = ['#39ff14', '#00ff41', '#32cd32', '#00cc00', '#66ff66', '#00aa00'];
  var ANCHOR_COLORS = ['#4682b4', '#5a9bd4', '#36648b', '#6ca6cd', '#3a6e9e'];

  // Jackpot sparkle particles floating around the item on the field
  var jackpotSparkles = [];
  // Jackpot golden rain particles (post-capture shower)
  var jackpotRainParticles = [];
  // Jackpot screen flash state
  var jackpotFlashAlpha = 0;

  // Nuke explosion state
  var nukeFlashAlpha = 0;
  var nukeShockwaves = [];
  var nukeSecondaryRing = [];

  // Fruit kinds for type checking
  var FRUIT_KINDS = { cherry: true, orange: true, apple: true, grape: true, strawberry: true };

  // Ball trail history — stores last N positions per ball index
  var BALL_TRAIL_LENGTH = 10;
  var ballTrails = {}; // map of ball ID to trail array: ballTrails[id] = [{x, y}, ...]

  // Active effect overlay states
  var shieldLevel = 0;
  var lastShieldFrameTime = 0;
  var lightningLevel = 0;
  var lastLightningFrameTime = 0;

  // Freeze overlay state
  var freezeLevel = 0;
  var lastFreezeFrameTime = 0;

  // ── Theme System ──
  var THEMES = {
    default: { bg: '#1a1a2e', ball: '#00cc44', boundary: '#ffffff', fill: 'rgba(0, 255, 136, 0.15)', accent: '#00ff88', hudBg: '#0a0a1a', name: 'Default' },
    neon:    { bg: '#000000', ball: '#ff00ff', boundary: '#00ffff', fill: 'rgba(255, 0, 255, 0.15)', accent: '#ff00ff', hudBg: '#000000', name: 'Neon' },
    retro:   { bg: '#0a0a00', ball: '#ffaa00', boundary: '#ff6600', fill: 'rgba(255, 204, 0, 0.15)', accent: '#ffcc00', hudBg: '#0a0a00', name: 'Retro' },
    ocean:   { bg: '#0a1628', ball: '#00ddff', boundary: '#4488ff', fill: 'rgba(0, 204, 255, 0.15)', accent: '#00ccff', hudBg: '#0a1628', name: 'Ocean' },
    lava:    { bg: '#1a0a0a', ball: '#ff3300', boundary: '#ff8800', fill: 'rgba(255, 68, 0, 0.15)', accent: '#ff4400', hudBg: '#1a0a0a', name: 'Lava' }
  };
  var currentTheme = THEMES['default'];

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  function accentRgba(alpha) {
    var c = hexToRgb(currentTheme.accent);
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')';
  }

  function setTheme(name) {
    currentTheme = THEMES[name] || THEMES['default'];
  }

  function getThemeName() {
    for (var key in THEMES) {
      if (THEMES[key] === currentTheme) return key;
    }
    return 'default';
  }
  // Shrink overlay state
  var shrinkLevel = 0;
  var lastShrinkFrameTime = 0;
  // Grow overlay state
  var growLevel = 0;
  var lastGrowFrameTime = 0;
  // Fusion overlay state
  var fusionLevel = 0;
  var lastFusionFrameTime = 0;
  // Fission overlay state
  var fissionPuLevel = 0;
  var lastFissionPuFrameTime = 0;
  // Wave overlay state
  var waveLevel = 0;
  var lastWaveFrameTime = 0;

  // Merge implosion particles
  var mergeParticles = [];

  // Slow-motion overlay state
  var slowLevel = 0;
  var lastSlowFrameTime = 0;

  /**
   * Initialize canvas element — set dimensions and return 2D context.
   */
  function initCanvas(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      throw new Error('Canvas element not found: ' + canvasId);
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    var ctx = canvas.getContext('2d');
    return { ctx: ctx, canvas: canvas };
  }

  /**
   * Update the animation clock — call once per frame before drawing.
   */
  function setFrameTime(t) {
    frameTime = t;
  }

  /**
   * Trigger screen shake (e.g., when losing a life).
   */
  function triggerShake(intensity, durationMs) {
    shakeIntensity = intensity || 6;
    shakeUntil = performance.now() + (durationMs || 300);
  }

  /**
   * Clear the entire canvas for the next frame, applying screen shake.
   */
  function clearCanvas(ctx) {
    // Compute shake offset
    var now = performance.now();
    if (now < shakeUntil) {
      var progress = (shakeUntil - now) / 300;
      shakeX = (Math.random() - 0.5) * 2 * shakeIntensity * progress;
      shakeY = (Math.random() - 0.5) * 2 * shakeIntensity * progress;
    } else {
      shakeX = 0;
      shakeY = 0;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);
    ctx.fillStyle = currentTheme.hudBg;
    ctx.fillRect(0, 0, CANVAS_WIDTH + 20, CANVAS_HEIGHT + 20);

    // Apply shake transform
    ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);
  }

  /**
   * Store the current level shape vertices from game state.
   */
  function setShapeVertices(vertices) {
    currentShapeVertices = vertices && vertices.length > 2 ? vertices : null;
  }

  /**
   * Trace the current shape as a canvas sub-path (no beginPath/fill).
   * Falls back to a rectangle when no shape is set.
   */
  function fillShapePath(ctx) {
    if (!currentShapeVertices || currentShapeVertices.length < 3) {
      ctx.rect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);
      return;
    }
    ctx.moveTo(currentShapeVertices[0].x, currentShapeVertices[0].y + PLAY_Y_OFFSET);
    for (var i = 1; i < currentShapeVertices.length; i++) {
      ctx.lineTo(currentShapeVertices[i].x, currentShapeVertices[i].y + PLAY_Y_OFFSET);
    }
    ctx.closePath();
  }

  /**
   * Point-in-polygon test (ray casting) for the current shape.
   */
  function isInsideShape(px, py) {
    var verts = currentShapeVertices;
    if (!verts || verts.length < 3) {
      return px >= 0 && px <= PLAY_WIDTH && py >= PLAY_Y_OFFSET && py <= PLAY_Y_OFFSET + PLAY_HEIGHT;
    }
    var inside = false;
    for (var i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      var xi = verts[i].x, yi = verts[i].y + PLAY_Y_OFFSET;
      var xj = verts[j].x, yj = verts[j].y + PLAY_Y_OFFSET;
      var intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Draw the play area border with subtle glow.
   */
  function drawPlayArea(ctx, state) {
    var vertices = currentShapeVertices;

    if (vertices && vertices.length > 2) {
      // Draw the shape polygon
      ctx.fillStyle = currentTheme.bg;
      ctx.beginPath();
      fillShapePath(ctx);
      ctx.fill();

      // Outer glow
      ctx.shadowColor = currentTheme.accent;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = currentTheme.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      // Fallback to rectangle
      var x = 0;
      var y = PLAY_Y_OFFSET;
      var w = PLAY_WIDTH;
      var h = PLAY_HEIGHT;

      ctx.fillStyle = currentTheme.bg;
      ctx.fillRect(x, y, w, h);

      ctx.shadowColor = currentTheme.accent;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = currentTheme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.shadowBlur = 0;

      ctx.strokeStyle = accentRgba(0.15);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
  }

  /**
   * Draw pre-filled obstacle shapes in the play area.
   * Obstacles look like permanent fixtures — solid, part of the level.
   */
  function drawObstacles(ctx, obstacles) {
    if (!obstacles || !obstacles.length) return;

    for (var i = 0; i < obstacles.length; i++) {
      var obs = obstacles[i];
      if (!obs.vertices || obs.vertices.length < 3) continue;

      // Build the polygon path
      ctx.beginPath();
      ctx.moveTo(obs.vertices[0].x, obs.vertices[0].y + PLAY_Y_OFFSET);
      for (var j = 1; j < obs.vertices.length; j++) {
        ctx.lineTo(obs.vertices[j].x, obs.vertices[j].y + PLAY_Y_OFFSET);
      }
      ctx.closePath();

      // Filled interior — slightly more opaque than regular claimed territory
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = currentTheme.fill;
      ctx.fill();

      // Subtle inner shadow for depth
      ctx.save();
      ctx.clip();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.stroke();
      ctx.restore();

      // Redraw path for the visible outline
      ctx.beginPath();
      ctx.moveTo(obs.vertices[0].x, obs.vertices[0].y + PLAY_Y_OFFSET);
      for (var k = 1; k < obs.vertices.length; k++) {
        ctx.lineTo(obs.vertices[k].x, obs.vertices[k].y + PLAY_Y_OFFSET);
      }
      ctx.closePath();

      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = currentTheme.boundary;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw a pulsing red overlay on the play area when on last life.
   * Call after drawPlayArea and before game objects.
   */
  function drawDangerOverlay(ctx, lives) {
    var now = performance.now();
    var dt = lastDangerFrameTime
      ? Math.min((now - lastDangerFrameTime) / 1000, 0.1)
      : 0.016;
    lastDangerFrameTime = now;

    // Lerp dangerLevel toward 1 (last life) or 0, over ~0.5s
    var target = (lives === 1) ? 1 : 0;
    dangerLevel += (target - dangerLevel) * Math.min(dt * 4.0, 1);

    if (dangerLevel < 0.005) {
      dangerLevel = 0;
      return;
    }

    // Slow ominous pulse at ~1.5 Hz
    var pulse = Math.sin(now * 0.00942);
    var red = Math.round(100 + 20 * pulse);
    var alpha = (0.35 + 0.05 * pulse) * dangerLevel;

    ctx.fillStyle = 'rgba(' + red + ', 0, 0, ' + alpha.toFixed(3) + ')';
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.fill();
  }

  /**
   * Draw balls with radial gradient for 3D look.
   */
  function drawBalls(ctx, balls) {
    if (!balls || !balls.length) return;

    // Track which ball IDs are alive this frame to prune stale trails
    var activeBallIds = {};

    for (var i = 0; i < balls.length; i++) {
      var ball = balls[i];
      var ballId = ball.id !== undefined ? ball.id : i;
      activeBallIds[ballId] = true;
      var screenX = ball.x;
      var screenY = ball.y + PLAY_Y_OFFSET;
      var radius = ball.radius || 8;
      var color = ball.color || currentTheme.ball;

      // Record position in trail (keyed by ball ID)
      if (!ballTrails[ballId]) ballTrails[ballId] = [];
      ballTrails[ballId].push({ x: screenX, y: screenY });
      if (ballTrails[ballId].length > BALL_TRAIL_LENGTH) ballTrails[ballId].shift();

      // Draw trail afterimages — no shadow blur for trails (perf)
      ctx.shadowBlur = 0;
      var trail = ballTrails[ballId];
      for (var t = 0; t < trail.length - 1; t++) {
        var progress = (t + 1) / trail.length;
        var trailAlpha = progress * 0.35;
        var trailRadius = radius * (0.3 + progress * 0.5);
        ctx.globalAlpha = trailAlpha;
        ctx.beginPath();
        ctx.arc(trail[t].x, trail[t].y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // Outer glow — shadow only on the main ball circle
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;

      // Radial gradient for 3D sphere look
      var grad = ctx.createRadialGradient(
        screenX - radius * 0.3, screenY - radius * 0.3, radius * 0.1,
        screenX, screenY, radius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, lightenColor(color, 40));
      grad.addColorStop(1, color);

      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Reset shadow immediately after main ball
      ctx.shadowBlur = 0;
    }

    // Prune trails for balls that no longer exist
    for (var trailId in ballTrails) {
      if (!activeBallIds[trailId]) delete ballTrails[trailId];
    }
  }

  /**
   * Lighten a hex color by a given amount.
   */
  function lightenColor(hex, amount) {
    hex = hex.replace('#', '');
    var r = Math.min(255, parseInt(hex.substring(0, 2), 16) + amount);
    var g = Math.min(255, parseInt(hex.substring(2, 4), 16) + amount);
    var b = Math.min(255, parseInt(hex.substring(4, 6), 16) + amount);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Draw completed boundary line segments.
   */
  function drawBoundaries(ctx, boundaries, obstacles) {
    if (!boundaries || !boundaries.length) return;

    ctx.save();

    // Clip boundary drawing to exclude obstacle interiors so boundary
    // lines that span through an obstacle don't render inside it.
    if (obstacles && obstacles.length) {
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (var oi = 0; oi < obstacles.length; oi++) {
        var obs = obstacles[oi];
        if (!obs.vertices || obs.vertices.length < 3) continue;
        ctx.moveTo(obs.vertices[0].x, obs.vertices[0].y + PLAY_Y_OFFSET);
        for (var oj = 1; oj < obs.vertices.length; oj++) {
          ctx.lineTo(obs.vertices[oj].x, obs.vertices[oj].y + PLAY_Y_OFFSET);
        }
        ctx.closePath();
      }
      ctx.clip('evenodd');
    }

    ctx.strokeStyle = currentTheme.boundary;
    ctx.lineWidth = 2;
    ctx.shadowColor = currentTheme.boundary;
    ctx.shadowBlur = 4;

    for (var i = 0; i < boundaries.length; i++) {
      var b = boundaries[i];
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1 + PLAY_Y_OFFSET);
      ctx.lineTo(b.x2, b.y2 + PLAY_Y_OFFSET);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Draw active growing lines with animated rainbow gradient.
   */
  function drawGrowingLines(ctx, lines) {
    if (!lines || !lines.length) return;

    var now = performance.now();
    // Base hue shifts with time so rainbow flows along the line
    var hueOffset = (now * 0.12) % 360;

    var pulse = 0.6 + 0.4 * Math.sin(now * 0.008);
    var glowSize = 8 + 6 * pulse;

    ctx.lineWidth = 3;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var sx1 = line.x1;
      var sy1 = line.y1 + PLAY_Y_OFFSET;
      var sx2 = line.x2;
      var sy2 = line.y2 + PLAY_Y_OFFSET;

      if (line.is_fire) {
        // Fire line — orange/red flickering glow
        var firePulse = 0.7 + 0.3 * Math.sin(now * 0.012 + i * 2.1);
        var fireFlicker = 0.9 + 0.1 * (Math.random());
        var fireGlowSize = 12 + 8 * firePulse;

        var fireGrad = ctx.createLinearGradient(sx1, sy1, sx2, sy2);
        fireGrad.addColorStop(0, 'rgba(255, 69, 0, ' + fireFlicker + ')');
        fireGrad.addColorStop(0.3, 'rgba(255, 140, 0, ' + (fireFlicker * 0.95) + ')');
        fireGrad.addColorStop(0.6, 'rgba(255, 69, 0, ' + fireFlicker + ')');
        fireGrad.addColorStop(1, 'rgba(255, 200, 0, ' + (fireFlicker * 0.9) + ')');

        ctx.shadowColor = 'rgba(255, 102, 0, ' + firePulse + ')';
        ctx.shadowBlur = fireGlowSize;

        var dashOffset = (now * 0.08) % 24;
        ctx.strokeStyle = fireGrad;
        ctx.lineWidth = 3 + Math.random() * 0.8;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -dashOffset;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();

        // Fire tips at endpoints
        drawFireTip(ctx, sx1, sy1, now);
        drawFireTip(ctx, sx2, sy2, now + 500);

        ctx.lineWidth = 3;
      } else {
        // Rainbow linear gradient flowing along the line (5 stops for perf)
        var grad = ctx.createLinearGradient(sx1, sy1, sx2, sy2);
        var numStops = 4;
        for (var s = 0; s <= numStops; s++) {
          var t = s / numStops;
          var hue = (hueOffset + t * 360) % 360;
          grad.addColorStop(t, 'hsl(' + hue + ', 100%, 60%)');
        }

        // Glow matches the mid-line hue for a vibrant aura
        var glowHue = (hueOffset + 180) % 360;
        ctx.shadowColor = 'hsla(' + glowHue + ', 100%, 60%, ' + pulse + ')';
        ctx.shadowBlur = glowSize;

        // Animated dash
        var dashOffset = (now * 0.05) % 24;
        ctx.strokeStyle = grad;
        ctx.setLineDash([8, 4]);
        ctx.lineDashOffset = -dashOffset;

        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();

        // Rainbow tips at endpoints
        drawLineTip(ctx, sx1, sy1, hueOffset);
        drawLineTip(ctx, sx2, sy2, (hueOffset + 180) % 360);
      }
    }

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.shadowBlur = 0;
  }

  /**
   * Draw a bright dot at a growing line tip with rainbow hue.
   */
  function drawLineTip(ctx, x, y, hue) {
    ctx.setLineDash([]);
    ctx.shadowColor = 'hsl(' + hue + ', 100%, 70%)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(' + hue + ', 100%, 80%)';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /**
   * Draw a fire-colored dot at a fire line tip with flickering glow.
   */
  function drawFireTip(ctx, x, y, seed) {
    var flicker = 0.7 + 0.3 * Math.sin(seed * 0.01);
    ctx.setLineDash([]);
    ctx.shadowColor = 'rgba(255, 100, 0, ' + flicker + ')';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /**
   * Fill enclosed (claimed) regions with fade-in animation.
   */
  function drawFilledRegions(ctx, regions) {
    if (!regions || !regions.length) return;

    // Clip filled regions to the current shape boundary
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    for (var i = 0; i < regions.length; i++) {
      var region = regions[i];

      // Track fade-in per region (use a key based on region geometry)
      var key = regionKey(region, i);
      if (!regionFadeMap[key]) {
        regionFadeMap[key] = frameTime;
      }
      var elapsed = frameTime - regionFadeMap[key];
      var fadeAlpha = Math.min(elapsed / REGION_FADE_DURATION, 1);

      ctx.globalAlpha = fadeAlpha * 0.7;
      ctx.fillStyle = currentTheme.fill;

      if (region.points && region.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(region.points[0].x, region.points[0].y + PLAY_Y_OFFSET);
        for (var j = 1; j < region.points.length; j++) {
          ctx.lineTo(region.points[j].x, region.points[j].y + PLAY_Y_OFFSET);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (region.width && region.height) {
        ctx.fillRect(region.x, region.y + PLAY_Y_OFFSET, region.width, region.height);
      }

      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }

  /**
   * Generate a stable key for a region to track fade state.
   */
  function regionKey(region, index) {
    if (region.points && region.points.length > 0) {
      return 'p' + region.points[0].x + ',' + region.points[0].y + ':' + region.points.length;
    }
    if (region.width && region.height) {
      return 'r' + region.x + ',' + region.y + ':' + region.width + 'x' + region.height;
    }
    return 'i' + index;
  }

  /**
   * Reset region fade map (call on level change).
   */
  function resetRegionFades() {
    regionFadeMap = {};
    ballTrails = {};
  }

  // ── Fission particle helpers ──

  /**
   * Create a burst of particles at a collision point.
   */
  function addFissionEffect(x, y) {
    var count = 15 + Math.floor(Math.random() * 6); // 15-20

    for (var i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) break;

      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
      var speed = 60 + Math.random() * 120;

      particles.push({
        x: x,
        y: y + PLAY_Y_OFFSET,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.35 + Math.random() * 0.25,
        color: FISSION_COLORS[Math.floor(Math.random() * FISSION_COLORS.length)],
        size: 1.5 + Math.random() * 2
      });
    }

    // Add a flash/glow ring
    fissionFlashes.push({
      x: x,
      y: y + PLAY_Y_OFFSET,
      radius: 4,
      maxRadius: 28 + Math.random() * 8,
      life: 1.0,
      decay: 3.5
    });
  }

  /**
   * Advance particle and flash positions/lifetimes.
   * @param {number} dt — seconds since last frame
   */
  function updateParticles(dt) {
    // Update particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96; // drag
      p.vy *= 0.96;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }

    // Update flash rings
    for (var j = fissionFlashes.length - 1; j >= 0; j--) {
      var f = fissionFlashes[j];
      f.life -= dt * f.decay;
      f.radius += (f.maxRadius - f.radius) * dt * 8;
      if (f.life <= 0) {
        fissionFlashes.splice(j, 1);
      }
    }

    // Update power-up capture effects
    updatePowerUpEffects(dt);

    // Update merge implosion particles
    for (var m = mergeParticles.length - 1; m >= 0; m--) {
      var mp = mergeParticles[m];
      // Pull inward toward center
      var dx = mp.cx - mp.x;
      var dy = mp.cy - mp.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        var pull = 300 * dt;
        mp.x += (dx / dist) * pull;
        mp.y += (dy / dist) * pull;
      }
      mp.life -= dt / mp.maxLife;
      if (mp.life <= 0) {
        mergeParticles.splice(m, 1);
      }
    }
  }

  // ── Fireworks celebration system ──
  var fireworkRockets = [];
  var fireworkParticles = [];
  var fireworksActive = false;
  var fireworksEndTime = 0;
  var fireworksSoundCallbacks = { onLaunch: null, onBurst: null };

  var FIREWORK_COLORS = {
    gold:   ['#FFD700', '#FFA500', '#FFEC8B', '#FFE4B5'],
    red:    ['#FF4444', '#FF0000', '#FF6B6B', '#FF8C69'],
    green:  ['#00FF88', '#00CC66', '#44FF99', '#88FFB8'],
    blue:   ['#4488FF', '#0066FF', '#66AAFF', '#88CCFF'],
    purple: ['#AA44FF', '#8800FF', '#CC88FF', '#DD99FF'],
    cyan:   ['#00FFFF', '#00CCCC', '#44FFEE', '#88FFFF']
  };
  var FIREWORK_COLOR_KEYS = ['gold', 'red', 'green', 'blue', 'purple', 'cyan'];

  function launchFireworks(duration, onLaunch, onBurst) {
    fireworksActive = true;
    fireworksEndTime = performance.now() + duration;
    fireworkRockets = [];
    fireworkParticles = [];
    fireworksSoundCallbacks.onLaunch = onLaunch || null;
    fireworksSoundCallbacks.onBurst = onBurst || null;

    // Schedule 8-12 rockets staggered over the duration
    var rocketCount = 8 + Math.floor(Math.random() * 5);
    for (var i = 0; i < rocketCount; i++) {
      var delay = (duration * 0.05) + Math.random() * (duration * 0.7);
      scheduleRocket(delay);
    }
  }

  function scheduleRocket(delay) {
    setTimeout(function () {
      if (!fireworksActive) return;
      spawnRocket();
    }, delay);
  }

  function spawnRocket() {
    var x = 60 + Math.random() * (PLAY_WIDTH - 120);
    var targetY = PLAY_Y_OFFSET + 60 + Math.random() * (PLAY_HEIGHT * 0.55);
    var colorKey = FIREWORK_COLOR_KEYS[Math.floor(Math.random() * FIREWORK_COLOR_KEYS.length)];
    var doubleBurst = Math.random() < 0.3;

    fireworkRockets.push({
      x: x,
      y: PLAY_Y_OFFSET + PLAY_HEIGHT,
      targetY: targetY,
      vx: (Math.random() - 0.5) * 30,
      vy: -(250 + Math.random() * 150),
      colorKey: colorKey,
      doubleBurst: doubleBurst,
      trail: [],
      exploded: false
    });

    if (fireworksSoundCallbacks.onLaunch) {
      fireworksSoundCallbacks.onLaunch();
    }
  }

  function explodeRocket(rocket) {
    var count = 50 + Math.floor(Math.random() * 30);
    var colors = FIREWORK_COLORS[rocket.colorKey];
    var isDouble = rocket.doubleBurst;

    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.3;
      var speed = 120 + Math.random() * 180;
      fireworkParticles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 1.4 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3,
        trail: [{ x: rocket.x, y: rocket.y }],
        gravity: 40 + Math.random() * 20,
        doubleBurst: isDouble,
        hasSubBurst: false,
        subBurstAt: 0.4 + Math.random() * 0.2
      });
    }

    if (fireworksSoundCallbacks.onBurst) {
      fireworksSoundCallbacks.onBurst();
    }
  }

  function subBurstParticle(p) {
    var count = 6 + Math.floor(Math.random() * 5);
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      var speed = 30 + Math.random() * 50;
      fireworkParticles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed + p.vx * 0.3,
        vy: Math.sin(angle) * speed + p.vy * 0.3,
        life: 1.0,
        maxLife: 0.5 + Math.random() * 0.3,
        color: p.color,
        size: 1 + Math.random() * 1.5,
        trail: [{ x: p.x, y: p.y }],
        gravity: 50,
        doubleBurst: false,
        hasSubBurst: false,
        subBurstAt: 0
      });
    }
  }

  function updateFireworks(dt) {
    if (!fireworksActive && fireworkRockets.length === 0 && fireworkParticles.length === 0) return;

    // Update rockets
    for (var r = fireworkRockets.length - 1; r >= 0; r--) {
      var rocket = fireworkRockets[r];
      if (rocket.exploded) {
        fireworkRockets.splice(r, 1);
        continue;
      }

      rocket.trail.push({ x: rocket.x, y: rocket.y });
      if (rocket.trail.length > 5) rocket.trail.shift();

      rocket.x += rocket.vx * dt;
      rocket.y += rocket.vy * dt;
      rocket.vy += 20 * dt;

      if (rocket.y <= rocket.targetY) {
        rocket.exploded = true;
        explodeRocket(rocket);
      }
    }

    // Update explosion particles
    for (var i = fireworkParticles.length - 1; i >= 0; i--) {
      var p = fireworkParticles[i];

      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 4) p.trail.shift();

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= (1 - 1.5 * dt);
      p.vy *= (1 - 1.0 * dt);
      p.life -= dt / p.maxLife;

      if (p.doubleBurst && !p.hasSubBurst && p.life <= p.subBurstAt) {
        p.hasSubBurst = true;
        subBurstParticle(p);
      }

      if (p.life <= 0) {
        fireworkParticles.splice(i, 1);
      }
    }

    // End fireworks when time is up and all visuals are done
    if (performance.now() > fireworksEndTime && fireworkRockets.length === 0 && fireworkParticles.length === 0) {
      fireworksActive = false;
    }
  }

  function drawFireworks(ctx) {
    if (!fireworksActive && fireworkRockets.length === 0 && fireworkParticles.length === 0) return;

    // Darken the play area for a "night sky" effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    var savedComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';

    // Draw rocket trails and heads
    for (var r = 0; r < fireworkRockets.length; r++) {
      var rocket = fireworkRockets[r];
      for (var t = 0; t < rocket.trail.length; t++) {
        var trailAlpha = (t + 1) / rocket.trail.length * 0.7;
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = '#FFEEAA';
        ctx.beginPath();
        ctx.arc(rocket.trail[t].x, rocket.trail[t].y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(rocket.x, rocket.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#FFDD88';
      ctx.beginPath();
      ctx.arc(rocket.x, rocket.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw explosion particles with trails and glow
    for (var i = 0; i < fireworkParticles.length; i++) {
      var p = fireworkParticles[i];
      var a = Math.max(0, p.life);

      // Particle trail
      for (var ti = 0; ti < p.trail.length; ti++) {
        var ta = a * (ti + 1) / p.trail.length * 0.4;
        ctx.globalAlpha = ta;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.trail[ti].x, p.trail[ti].y, p.size * a * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bright white core
      ctx.globalAlpha = a;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Larger colored glow
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = savedComposite;
  }

  function isFireworksActive() {
    return fireworksActive || fireworkRockets.length > 0 || fireworkParticles.length > 0;
  }

  /**
   * Render active particles and flash rings.
   */
  function drawParticles(ctx) {
    // Draw flash/glow rings first (behind particles)
    for (var j = 0; j < fissionFlashes.length; j++) {
      var f = fissionFlashes[j];
      var alpha = Math.max(0, f.life * 0.6);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (alpha * 0.4) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 200, ' + alpha + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw merge implosion particles
    for (var m = 0; m < mergeParticles.length; m++) {
      var mp = mergeParticles[m];
      var ma = Math.max(0, mp.life);
      ctx.globalAlpha = ma;
      ctx.fillStyle = mp.color;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, mp.size * ma, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
  }

  /**
   * Draw the heads-up display: hearts, score, fill bar, level.
   */
  function drawHUD(ctx, gameState) {
    var state = gameState || {};
    var lives = state.lives != null ? state.lives : 3;
    var score = state.score != null ? state.score : 0;
    var fillPct = state.fillPercent != null ? state.fillPercent : 0;
    var level = state.level != null ? state.level : 1;

    // HUD background
    ctx.fillStyle = currentTheme.hudBg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);

    // Bottom border
    ctx.strokeStyle = currentTheme.accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT);
    ctx.lineTo(CANVAS_WIDTH, HUD_HEIGHT);
    ctx.stroke();

    var midY = HUD_HEIGHT / 2;

    // ── Lives as hearts (left) ──
    ctx.font = '18px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    var heartStr = '';
    for (var i = 0; i < lives; i++) {
      heartStr += '♥ ';
    }
    ctx.fillStyle = '#ff4444';
    ctx.fillText(heartStr || '—', 16, midY);

    // ── Score (center-left) ──
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE ' + score, 160, midY);

    // ── Fill progress bar (center) ──
    var barX = 360;
    var barW = 200;
    var barH = 16;
    var barY = midY - barH / 2;
    var fillW = (fillPct / 100) * barW;

    // Bar background
    ctx.fillStyle = '#222';
    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fill();

    // Filled portion with gradient
    if (fillW > 0) {
      var barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      if (fillPct >= 80) {
        barGrad.addColorStop(0, '#00cc66');
        barGrad.addColorStop(1, currentTheme.accent);
      } else {
        barGrad.addColorStop(0, '#0066cc');
        barGrad.addColorStop(1, '#00aaff');
      }
      ctx.fillStyle = barGrad;
      roundRect(ctx, barX, barY, fillW, barH, 3);
      ctx.fill();
    }

    // Bar border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.stroke();

    // Percentage text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fillPct.toFixed(1) + '%', barX + barW / 2, midY);

    // 70% goal marker
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    var goalX = barX + 0.7 * barW;
    ctx.beginPath();
    ctx.moveTo(goalX, barY - 2);
    ctx.lineTo(goalX, barY + barH + 2);
    ctx.stroke();

    // Goal label
    ctx.fillStyle = '#ff4444';
    ctx.font = '9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('70%', goalX, barY - 6);

    // ── Timer (center-right) ──
    var levelTimer = state.levelTimer != null ? state.levelTimer : null;
    if (levelTimer != null) {
      var timerStr = '\u23F1 ' + levelTimer.toFixed(1);
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.textAlign = 'right';

      if (levelTimer < 10) {
        // Red with pulse
        var pulse10 = 0.7 + 0.3 * Math.sin(frameTime * 0.012);
        ctx.fillStyle = 'rgba(255, 68, 68, ' + pulse10 + ')';
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 6 + 4 * pulse10;
      } else if (levelTimer < 30) {
        ctx.fillStyle = '#ffcc00';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = '#ccffcc';
        ctx.shadowBlur = 0;
      }

      ctx.fillText(timerStr, CANVAS_WIDTH - 90, midY);
      ctx.shadowBlur = 0;
    }

    // ── Level (right) ──
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = currentTheme.accent;
    ctx.textAlign = 'right';
    ctx.fillText('LVL ' + level, CANVAS_WIDTH - 16, midY);
  }

  /**
   * Draw a rounded rectangle path.
   */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Draw the score on canvas (standalone utility).
   */
  function drawScore(ctx, score) {
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ffcc00';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText('SCORE: ' + (score || 0), CANVAS_WIDTH - 16, 8);
  }

  /**
   * Draw crosshair at cursor position indicating current line direction.
   * When shield or lightning power-ups are active, shows visual indicators
   * so the player knows what their next line will carry.
   */
  function drawDirectionIndicator(ctx, mousePos, direction, shieldActive, lightningActive, fireActive) {
    if (!mousePos || mousePos.x == null || mousePos.y == null) return;
    if (!isInsideShape(mousePos.x, mousePos.y)) return;

    var x = mousePos.x;
    var y = mousePos.y;
    var size = 20;
    var now = performance.now();

    // ── Shield glow ring ──
    if (shieldActive) {
      var shieldPulse = 0.35 + 0.2 * Math.sin(now * 0.004);
      var shieldRadius = 26 + 3 * Math.sin(now * 0.003);
      var shieldGrad = ctx.createRadialGradient(x, y, 10, x, y, shieldRadius);
      shieldGrad.addColorStop(0, 'rgba(100, 160, 255, 0)');
      shieldGrad.addColorStop(0.6, 'rgba(100, 160, 255, ' + (shieldPulse * 0.4) + ')');
      shieldGrad.addColorStop(1, 'rgba(100, 160, 255, 0)');
      ctx.fillStyle = shieldGrad;
      ctx.beginPath();
      ctx.arc(x, y, shieldRadius, 0, Math.PI * 2);
      ctx.fill();

      // Shield ring outline
      ctx.strokeStyle = 'rgba(120, 180, 255, ' + shieldPulse + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, shieldRadius - 2, 0, Math.PI * 2);
      ctx.stroke();

      // Shield emoji badge
      ctx.save();
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText('\uD83D\uDEE1\uFE0F', x + 18, y - 18);
      ctx.restore();
    }

    // ── Lightning sparks ──
    if (lightningActive) {
      ctx.save();
      var sparkCount = 6;
      for (var si = 0; si < sparkCount; si++) {
        var sparkAngle = (Math.PI * 2 / sparkCount) * si + now * 0.002;
        // Flicker: each spark has its own random-seeded phase
        var flicker = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.012 + si * 2.3));
        var sparkDist = 18 + 6 * Math.sin(now * 0.005 + si * 1.1);
        var sx = x + Math.cos(sparkAngle) * sparkDist;
        var sy = y + Math.sin(sparkAngle) * sparkDist;

        // Small lightning bolt lines
        ctx.strokeStyle = 'rgba(255, 220, 50, ' + flicker + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        var boltLen = 5 + 3 * Math.sin(now * 0.008 + si);
        ctx.moveTo(sx, sy - boltLen);
        ctx.lineTo(sx + 2, sy);
        ctx.lineTo(sx - 2, sy + 1);
        ctx.lineTo(sx, sy + boltLen);
        ctx.stroke();
      }

      // Yellow glow around cursor
      var ltGlow = 0.15 + 0.1 * Math.sin(now * 0.006);
      var ltGrad = ctx.createRadialGradient(x, y, 4, x, y, 28);
      ltGrad.addColorStop(0, 'rgba(255, 220, 50, ' + ltGlow + ')');
      ltGrad.addColorStop(1, 'rgba(255, 220, 50, 0)');
      ctx.fillStyle = ltGrad;
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();

      // Lightning emoji badge
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText('\u26A1', x + (shieldActive ? -18 : 18), y - 18);
      ctx.restore();
    }

    // ── Fire glow ──
    if (fireActive) {
      ctx.save();
      var fireCursorPulse = 0.3 + 0.2 * Math.sin(now * 0.005);
      var fireCursorGrad = ctx.createRadialGradient(x, y, 4, x, y, 26);
      fireCursorGrad.addColorStop(0, 'rgba(255, 69, 0, ' + fireCursorPulse + ')');
      fireCursorGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
      ctx.fillStyle = fireCursorGrad;
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI * 2);
      ctx.fill();

      // Fire emoji badge
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      var fireXOffset = shieldActive && lightningActive ? 0 : (shieldActive || lightningActive ? -18 : 18);
      ctx.fillText('\uD83D\uDD25', x + fireXOffset, y + 18);
      ctx.restore();
    }

    // ── Standard crosshair ──
    ctx.strokeStyle = currentTheme.accent;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.stroke();

    if (direction === 'vertical') {
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y - 6);
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x, y + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y - size + 6);
      ctx.lineTo(x, y - size);
      ctx.lineTo(x + 4, y - size + 6);
      ctx.moveTo(x - 4, y + size - 6);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x + 4, y + size - 6);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x - 6, y);
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + size, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - size + 6, y - 4);
      ctx.lineTo(x - size, y);
      ctx.lineTo(x - size + 6, y + 4);
      ctx.moveTo(x + size - 6, y - 4);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size - 6, y + 4);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  // ── Power-up rendering ──

  /**
   * Draw floating power-up items with bob animation and pulsing aura.
   */
  function drawPowerUps(ctx, powerups) {
    if (!powerups || !powerups.length) return;

    var now = performance.now();

    for (var i = 0; i < powerups.length; i++) {
      var pu = powerups[i];
      if (!pu.active) continue;

      var screenX = pu.x;
      var screenY = pu.y + PLAY_Y_OFFSET;

      // Gentle bob — each item gets a phase offset from its id
      var phase = (pu.id || i) * 1.7;
      var bob = Math.sin(now * 0.003 + phase) * 4;
      var drawY = screenY + bob;

      // Pulsing scale for "collectible" feel
      var scalePulse = 1.0 + 0.08 * Math.sin(now * 0.005 + phase);

      // Pulsing aura glow
      var auraPulse = 0.25 + 0.15 * Math.sin(now * 0.004 + phase);
      var auraRadius = 18 * scalePulse;

      if (pu.kind === 'heart') {
        // Red/pink aura
        var heartGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        heartGrad.addColorStop(0, 'rgba(255, 68, 100, ' + auraPulse + ')');
        heartGrad.addColorStop(1, 'rgba(255, 68, 100, 0)');
        ctx.fillStyle = heartGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        // Heart emoji
        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff4466';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ff4466';
        ctx.fillText('\u2764\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'clock') {
        // Blue/cyan aura
        var clockGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        clockGrad.addColorStop(0, 'rgba(68, 200, 255, ' + auraPulse + ')');
        clockGrad.addColorStop(1, 'rgba(68, 200, 255, 0)');
        ctx.fillStyle = clockGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        // Clock emoji
        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#44ccff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#44ccff';
        ctx.fillText('\u23F1\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'shield') {
        // Blue/silver aura
        var shieldGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        shieldGrad.addColorStop(0, 'rgba(68, 136, 255, ' + auraPulse + ')');
        shieldGrad.addColorStop(0.6, 'rgba(170, 200, 255, ' + (auraPulse * 0.5) + ')');
        shieldGrad.addColorStop(1, 'rgba(68, 136, 255, 0)');
        ctx.fillStyle = shieldGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#88aaff';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#88aaff';
        ctx.fillText('\uD83D\uDEE1\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'lightning') {
        // Yellow/electric aura
        var lightGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        lightGrad.addColorStop(0, 'rgba(255, 238, 68, ' + auraPulse + ')');
        lightGrad.addColorStop(0.5, 'rgba(255, 204, 0, ' + (auraPulse * 0.4) + ')');
        lightGrad.addColorStop(1, 'rgba(255, 238, 68, 0)');
        ctx.fillStyle = lightGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffdd00';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ffdd00';
        ctx.fillText('\u26A1', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'bomb') {
        // Orange/red aura
        var bombGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        bombGrad.addColorStop(0, 'rgba(255, 100, 0, ' + auraPulse + ')');
        bombGrad.addColorStop(0.6, 'rgba(255, 50, 0, ' + (auraPulse * 0.4) + ')');
        bombGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = bombGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff4400';
        ctx.fillText('\uD83D\uDCA3', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'mystery') {
        // Rainbow cycling aura
        var mystHue = (now * 0.12 + phase * 40) % 360;
        var mystColor = 'hsla(' + mystHue + ', 100%, 60%, ';
        var mystGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        mystGrad.addColorStop(0, mystColor + auraPulse + ')');
        mystGrad.addColorStop(1, mystColor + '0)');
        ctx.fillStyle = mystGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'hsl(' + mystHue + ', 100%, 60%)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'hsl(' + mystHue + ', 100%, 70%)';
        ctx.fillText('\uD83C\uDFB2', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'freeze') {
        // Icy white/cyan aura
        var freezeGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        freezeGrad.addColorStop(0, 'rgba(200, 240, 255, ' + auraPulse + ')');
        freezeGrad.addColorStop(0.5, 'rgba(136, 232, 255, ' + (auraPulse * 0.5) + ')');
        freezeGrad.addColorStop(1, 'rgba(200, 240, 255, 0)');
        ctx.fillStyle = freezeGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#aaeeff';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ccf2ff';
        ctx.fillText('\uD83E\uDDCA', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'shrink') {
        // Purple glow aura
        var shrinkGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        shrinkGrad.addColorStop(0, 'rgba(200, 100, 255, ' + auraPulse + ')');
        shrinkGrad.addColorStop(0.6, 'rgba(170, 68, 221, ' + (auraPulse * 0.4) + ')');
        shrinkGrad.addColorStop(1, 'rgba(200, 100, 255, 0)');
        ctx.fillStyle = shrinkGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#cc66ff';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#dd88ff';
        ctx.fillText('\uD83D\uDD0D', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'skull') {
        // Dark red/black menacing aura with aggressive pulse
        var skullPulse = 1.0 + 0.14 * Math.sin(now * 0.008 + phase);
        var skullAuraPulse = 0.3 + 0.2 * Math.sin(now * 0.006 + phase);
        var skullAuraRadius = 22 * skullPulse;

        // Outer dark glow
        var skullGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, skullAuraRadius);
        skullGrad.addColorStop(0, 'rgba(200, 0, 0, ' + skullAuraPulse + ')');
        skullGrad.addColorStop(0.4, 'rgba(120, 0, 0, ' + (skullAuraPulse * 0.6) + ')');
        skullGrad.addColorStop(0.7, 'rgba(40, 0, 0, ' + (skullAuraPulse * 0.3) + ')');
        skullGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = skullGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, skullAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * skullPulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#cc0000';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#cc0000';
        ctx.fillText('\u2620\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'grow') {
        // Orange/red menacing aura (hazard item like skull)
        var growPulse = 1.0 + 0.14 * Math.sin(now * 0.008 + phase);
        var growAuraPulse = 0.3 + 0.2 * Math.sin(now * 0.006 + phase);
        var growAuraRadius = 22 * growPulse;

        var growGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, growAuraRadius);
        growGrad.addColorStop(0, 'rgba(255, 100, 0, ' + growAuraPulse + ')');
        growGrad.addColorStop(0.4, 'rgba(200, 50, 0, ' + (growAuraPulse * 0.6) + ')');
        growGrad.addColorStop(0.7, 'rgba(120, 20, 0, ' + (growAuraPulse * 0.3) + ')');
        growGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = growGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, growAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * growPulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ff4400';
        ctx.fillText('\uD83C\uDF44', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'web') {
        // Silvery/white glow aura
        var webGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        webGrad.addColorStop(0, 'rgba(230, 230, 240, ' + auraPulse + ')');
        webGrad.addColorStop(0.5, 'rgba(200, 200, 220, ' + (auraPulse * 0.5) + ')');
        webGrad.addColorStop(1, 'rgba(220, 220, 235, 0)');
        ctx.fillStyle = webGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ccccdd';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ddddee';
        ctx.fillText('\uD83D\uDD78\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'portal') {
        // Purple/indigo vortex aura
        var portalGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        portalGrad.addColorStop(0, 'rgba(170, 68, 255, ' + auraPulse + ')');
        portalGrad.addColorStop(0.5, 'rgba(100, 30, 200, ' + (auraPulse * 0.5) + ')');
        portalGrad.addColorStop(1, 'rgba(80, 20, 180, 0)');
        ctx.fillStyle = portalGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#aa44ff';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#cc66ff';
        ctx.fillText('\uD83C\uDF00', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'sinkhole') {
        // Dark purple/void glow aura
        var sinkGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        sinkGrad.addColorStop(0, 'rgba(80, 0, 120, ' + auraPulse + ')');
        sinkGrad.addColorStop(0.5, 'rgba(40, 0, 60, ' + (auraPulse * 0.5) + ')');
        sinkGrad.addColorStop(1, 'rgba(20, 0, 40, 0)');
        ctx.fillStyle = sinkGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#6600aa';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#7711bb';
        ctx.fillText('\uD83D\uDD73\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'snake') {
        // Green serpentine aura
        var snakeGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        snakeGrad.addColorStop(0, 'rgba(34, 204, 68, ' + auraPulse + ')');
        snakeGrad.addColorStop(0.5, 'rgba(17, 136, 51, ' + (auraPulse * 0.5) + ')');
        snakeGrad.addColorStop(1, 'rgba(0, 170, 34, 0)');
        ctx.fillStyle = snakeGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#22cc44';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#33ff55';
        ctx.fillText('\uD83D\uDC0D', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'nuke') {
        // Radioactive yellow/orange pulsing glow — more dangerous than bomb
        var nukeAuraRadius = 28 * scalePulse;
        var nukeAuraPulse = 0.4 + 0.25 * Math.sin(now * 0.007 + phase);
        var nukeGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, nukeAuraRadius);
        nukeGrad.addColorStop(0, 'rgba(255, 255, 100, ' + nukeAuraPulse + ')');
        nukeGrad.addColorStop(0.3, 'rgba(255, 200, 0, ' + (nukeAuraPulse * 0.7) + ')');
        nukeGrad.addColorStop(0.6, 'rgba(255, 120, 0, ' + (nukeAuraPulse * 0.4) + ')');
        nukeGrad.addColorStop(1, 'rgba(255, 80, 0, 0)');
        ctx.fillStyle = nukeGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, nukeAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        // Secondary outer hazard halo
        var nukeHaloRadius = 38 * scalePulse;
        var nukeHaloPulse = 0.15 + 0.1 * Math.sin(now * 0.005 + phase + 2.0);
        var nukeHaloGrad = ctx.createRadialGradient(screenX, drawY, nukeAuraRadius * 0.7, screenX, drawY, nukeHaloRadius);
        nukeHaloGrad.addColorStop(0, 'rgba(255, 200, 0, ' + nukeHaloPulse + ')');
        nukeHaloGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = nukeHaloGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, nukeHaloRadius, 0, Math.PI * 2);
        ctx.fill();

        // ☢️ emoji
        ctx.save();
        ctx.font = Math.round(22 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('\u2622\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'jackpot') {
        // Brilliant GOLD glow — much larger and brighter than other items
        var jpAuraRadius = 32 * scalePulse;
        var jpAuraPulse = 0.45 + 0.25 * Math.sin(now * 0.006 + phase);
        var jpGrad = ctx.createRadialGradient(screenX, drawY, 3, screenX, drawY, jpAuraRadius);
        jpGrad.addColorStop(0, 'rgba(255, 215, 0, ' + jpAuraPulse + ')');
        jpGrad.addColorStop(0.35, 'rgba(255, 236, 128, ' + (jpAuraPulse * 0.6) + ')');
        jpGrad.addColorStop(0.7, 'rgba(255, 170, 0, ' + (jpAuraPulse * 0.3) + ')');
        jpGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = jpGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, jpAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        // Second outer halo ring for extra radiance
        var haloRadius = 44 * scalePulse;
        var haloPulse = 0.12 + 0.08 * Math.sin(now * 0.004 + phase + 1.5);
        var haloGrad = ctx.createRadialGradient(screenX, drawY, jpAuraRadius * 0.8, screenX, drawY, haloRadius);
        haloGrad.addColorStop(0, 'rgba(255, 236, 128, ' + haloPulse + ')');
        haloGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, haloRadius, 0, Math.PI * 2);
        ctx.fill();

        // Spawn sparkle particles floating around the item constantly
        if (Math.random() > 0.5) {
          var spAngle = Math.random() * Math.PI * 2;
          var spDist = 8 + Math.random() * 22;
          jackpotSparkles.push({
            x: screenX + Math.cos(spAngle) * spDist,
            y: drawY + Math.sin(spAngle) * spDist,
            vx: (Math.random() - 0.5) * 20,
            vy: -15 - Math.random() * 25,
            life: 1.0,
            maxLife: 0.5 + Math.random() * 0.4,
            size: 1 + Math.random() * 2.5,
            color: JACKPOT_COLORS[Math.floor(Math.random() * JACKPOT_COLORS.length)]
          });
        }

        // Money bag emoji
        ctx.save();
        ctx.font = Math.round(24 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffd700';
        ctx.fillText('\uD83D\uDCB2', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'fusion') {
        // Warm golden/amber aura
        var fusionGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        fusionGrad.addColorStop(0, 'rgba(255, 200, 50, ' + auraPulse + ')');
        fusionGrad.addColorStop(0.5, 'rgba(220, 160, 30, ' + (auraPulse * 0.5) + ')');
        fusionGrad.addColorStop(1, 'rgba(200, 140, 20, 0)');
        ctx.fillStyle = fusionGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffcc33';
        ctx.fillText('\uD83D\uDD17', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'fission_pu') {
        // Red/orange warning glow — hazard power-up
        var fissionPuPulse = 1.0 + 0.14 * Math.sin(now * 0.008 + phase);
        var fissionPuAuraPulse = 0.3 + 0.2 * Math.sin(now * 0.006 + phase);
        var fissionPuAuraRadius = 22 * fissionPuPulse;

        var fissionPuGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, fissionPuAuraRadius);
        fissionPuGrad.addColorStop(0, 'rgba(255, 80, 0, ' + fissionPuAuraPulse + ')');
        fissionPuGrad.addColorStop(0.4, 'rgba(220, 40, 0, ' + (fissionPuAuraPulse * 0.6) + ')');
        fissionPuGrad.addColorStop(0.7, 'rgba(140, 20, 0, ' + (fissionPuAuraPulse * 0.3) + ')');
        fissionPuGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = fissionPuGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, fissionPuAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * fissionPuPulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff4400';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ff4400';
        ctx.fillText('\u269B\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'wave') {
        // Blue/teal glow
        var waveGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        waveGrad.addColorStop(0, 'rgba(0, 160, 220, ' + auraPulse + ')');
        waveGrad.addColorStop(0.5, 'rgba(0, 120, 180, ' + (auraPulse * 0.5) + ')');
        waveGrad.addColorStop(1, 'rgba(0, 80, 140, 0)');
        ctx.fillStyle = waveGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00aadd';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#22ccee';
        ctx.fillText('\u3030\uFE0F', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'magnet') {
        // Red/silver metallic glow aura
        var magnetGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        magnetGrad.addColorStop(0, 'rgba(220, 50, 50, ' + auraPulse + ')');
        magnetGrad.addColorStop(0.5, 'rgba(192, 192, 192, ' + (auraPulse * 0.5) + ')');
        magnetGrad.addColorStop(1, 'rgba(220, 50, 50, 0)');
        ctx.fillStyle = magnetGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#cc3333';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#dd4444';
        ctx.fillText('\uD83E\uDDF2', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'candy') {
        // Pink/magenta candy glow aura
        var candyGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, auraRadius);
        candyGrad.addColorStop(0, 'rgba(255, 105, 180, ' + auraPulse + ')');
        candyGrad.addColorStop(0.5, 'rgba(255, 0, 255, ' + (auraPulse * 0.5) + ')');
        candyGrad.addColorStop(1, 'rgba(255, 105, 180, 0)');
        ctx.fillStyle = candyGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, auraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff69b4';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ff69b4';
        ctx.fillText('\uD83C\uDF6C', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'fire') {
        // Orange/red fire aura with heat shimmer
        var fireAuraPulse = 0.35 + 0.2 * Math.sin(now * 0.006 + phase);
        var fireAuraRadius = 20 * scalePulse;
        var fireGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, fireAuraRadius);
        fireGrad.addColorStop(0, 'rgba(255, 69, 0, ' + fireAuraPulse + ')');
        fireGrad.addColorStop(0.4, 'rgba(255, 120, 0, ' + (fireAuraPulse * 0.6) + ')');
        fireGrad.addColorStop(0.7, 'rgba(255, 180, 0, ' + (fireAuraPulse * 0.3) + ')');
        fireGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
        ctx.fillStyle = fireGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, fireAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff4500';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#ff4500';
        ctx.fillText('\uD83D\uDD25', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'acid') {
        // Neon green acid aura
        var acidAuraPulse = 0.35 + 0.2 * Math.sin(now * 0.006 + phase);
        var acidAuraRadius = 20 * scalePulse;
        var acidGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, acidAuraRadius);
        acidGrad.addColorStop(0, 'rgba(57, 255, 20, ' + acidAuraPulse + ')');
        acidGrad.addColorStop(0.4, 'rgba(0, 204, 0, ' + (acidAuraPulse * 0.6) + ')');
        acidGrad.addColorStop(0.7, 'rgba(50, 205, 50, ' + (acidAuraPulse * 0.3) + ')');
        acidGrad.addColorStop(1, 'rgba(57, 255, 20, 0)');
        ctx.fillStyle = acidGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, acidAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#39ff14';
        ctx.fillText('\uD83E\uDDEA', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (pu.kind === 'anchor') {
        // Dark steel blue anchor aura
        var anchorAuraPulse = 0.35 + 0.2 * Math.sin(now * 0.004 + phase);
        var anchorAuraRadius = 22 * scalePulse;
        var anchorGrad = ctx.createRadialGradient(screenX, drawY, 2, screenX, drawY, anchorAuraRadius);
        anchorGrad.addColorStop(0, 'rgba(70, 130, 180, ' + anchorAuraPulse + ')');
        anchorGrad.addColorStop(0.4, 'rgba(54, 100, 139, ' + (anchorAuraPulse * 0.6) + ')');
        anchorGrad.addColorStop(0.7, 'rgba(58, 110, 158, ' + (anchorAuraPulse * 0.3) + ')');
        anchorGrad.addColorStop(1, 'rgba(70, 130, 180, 0)');
        ctx.fillStyle = anchorGrad;
        ctx.beginPath();
        ctx.arc(screenX, drawY, anchorAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(20 * scalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#4682b4';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#4682b4';
        ctx.fillText('\u2693', screenX, drawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      } else if (FRUIT_KINDS[pu.kind]) {
        // Fruits bob faster and have smaller glow
        var fruitBob = Math.sin(now * 0.005 + phase) * 3;
        var fruitDrawY = screenY + fruitBob;
        var fruitScalePulse = 1.0 + 0.06 * Math.sin(now * 0.006 + phase);
        var fruitAuraPulse = 0.18 + 0.1 * Math.sin(now * 0.005 + phase);
        var fruitAuraRadius = 14 * fruitScalePulse;

        var fruitEmoji, fruitShadowColor;
        if (pu.kind === 'cherry') {
          fruitEmoji = '\uD83C\uDF52'; fruitShadowColor = '#ff6644';
        } else if (pu.kind === 'orange') {
          fruitEmoji = '\uD83C\uDF4A'; fruitShadowColor = '#ff9922';
        } else if (pu.kind === 'apple') {
          fruitEmoji = '\uD83C\uDF4E'; fruitShadowColor = '#ff4444';
        } else if (pu.kind === 'grape') {
          fruitEmoji = '\uD83C\uDF47'; fruitShadowColor = '#9944cc';
        } else {
          fruitEmoji = '\uD83C\uDF53'; fruitShadowColor = '#ffcc00';
        }

        // Warm/purple/golden glow per fruit
        var fruitGlowColor;
        if (pu.kind === 'grape') {
          fruitGlowColor = 'rgba(153, 68, 204, ';
        } else if (pu.kind === 'strawberry') {
          fruitGlowColor = 'rgba(255, 204, 0, ';
        } else {
          fruitGlowColor = 'rgba(255, 160, 60, ';
        }
        var fruitGrad = ctx.createRadialGradient(screenX, fruitDrawY, 2, screenX, fruitDrawY, fruitAuraRadius);
        fruitGrad.addColorStop(0, fruitGlowColor + fruitAuraPulse + ')');
        fruitGrad.addColorStop(1, fruitGlowColor + '0)');
        ctx.fillStyle = fruitGrad;
        ctx.beginPath();
        ctx.arc(screenX, fruitDrawY, fruitAuraRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.font = Math.round(18 * fruitScalePulse) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = fruitShadowColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = fruitShadowColor;
        ctx.fillText(fruitEmoji, screenX, fruitDrawY);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
  }

  /**
   * Add a capture burst effect at a power-up's location.
   */
  function addPowerUpEffect(x, y, kind, points) {
    var colorMap = {
      heart: HEART_COLORS,
      clock: CLOCK_COLORS,
      shield: SHIELD_COLORS,
      lightning: LIGHTNING_COLORS,
      bomb: BOMB_COLORS,
      mystery: MYSTERY_COLORS,
      freeze: FREEZE_COLORS,
      shrink: SHRINK_COLORS,
      skull: SKULL_COLORS,
      grow: GROW_COLORS,
      fusion: FUSION_COLORS,
      fission_pu: FISSION_PU_COLORS,
      wave: WAVE_COLORS_PU,
      web: WEB_COLORS,
      portal: PORTAL_COLORS,
      sinkhole: SINKHOLE_COLORS,
      snake: SNAKE_COLORS,
      nuke: NUKE_COLORS,
      jackpot: JACKPOT_COLORS,
      magnet: MAGNET_COLORS,
      fire: FIRE_COLORS,
      acid: ACID_COLORS,
      anchor: ANCHOR_COLORS
    };
    var isFruit = !!FRUIT_KINDS[kind];

    // Nuke captured — skip normal burst, the massive explosion is triggered separately
    if (kind === 'nuke') {
      // Just show floating text for the capture; addNukeExplosion handles the blast
      powerUpTexts.push({
        x: x,
        y: y + PLAY_Y_OFFSET - 10,
        text: '\u2622\uFE0F NUKE!',
        color: '#ffee44',
        life: 1.0,
        maxLife: 2.0,
        fontSize: 26
      });
      return;
    }

    var colors = isFruit ? FRUIT_COLORS : (colorMap[kind] || CLOCK_COLORS);
    var count = kind === 'jackpot' ? 55 + Math.floor(Math.random() * 10)
      : kind === 'bomb' ? 30 + Math.floor(Math.random() * 8)
      : kind === 'skull' ? 26 + Math.floor(Math.random() * 6)
      : kind === 'grow' ? 26 + Math.floor(Math.random() * 6)
      : kind === 'fission_pu' ? 26 + Math.floor(Math.random() * 6)
      : isFruit ? 12 + Math.floor(Math.random() * 4)
      : 18 + Math.floor(Math.random() * 6);
    var speedMul = kind === 'jackpot' ? 2.0 : kind === 'bomb' ? 1.5 : kind === 'skull' ? 1.3 : kind === 'grow' ? 1.3 : kind === 'fission_pu' ? 1.3 : isFruit ? 0.8 : 1.0;

    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;

      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      var speed = (50 + Math.random() * 100) * speedMul;

      powerUpParticles.push({
        x: x,
        y: y + PLAY_Y_OFFSET,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.4 + Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * (kind === 'bomb' ? 3.5 : isFruit ? 2 : 2.5)
      });
    }

    // Flash ring
    fissionFlashes.push({
      x: x,
      y: y + PLAY_Y_OFFSET,
      radius: kind === 'jackpot' ? 15 : kind === 'bomb' ? 10 : isFruit ? 4 : 6,
      maxRadius: kind === 'jackpot' ? 80 : kind === 'bomb' ? 55 : isFruit ? 25 : 35 + Math.random() * 10,
      life: 1.0,
      decay: kind === 'jackpot' ? 1.5 : kind === 'bomb' ? 2.0 : 3.0
    });

    // Jackpot: golden screen flash + raining sparkles
    if (kind === 'jackpot') {
      jackpotFlashAlpha = 0.6;

      // Spawn golden rain particles across the full screen width
      for (var ri = 0; ri < 80; ri++) {
        jackpotRainParticles.push({
          x: Math.random() * PLAY_WIDTH,
          y: PLAY_Y_OFFSET + Math.random() * 40,
          vx: (Math.random() - 0.5) * 30,
          vy: 60 + Math.random() * 120,
          life: 1.0,
          maxLife: 1.5 + Math.random() * 0.8,
          size: 1.5 + Math.random() * 2.5,
          color: JACKPOT_COLORS[Math.floor(Math.random() * JACKPOT_COLORS.length)]
        });
      }
    }

    // Floating text
    var textMap = {
      heart: '\u2764\uFE0F +1 LIFE',
      clock: '\u23F1\uFE0F SLOW!',
      shield: '\uD83D\uDEE1\uFE0F SHIELD!',
      lightning: '\u26A1 SPEED!',
      bomb: '\uD83D\uDCA3 BOOM!',
      mystery: '\uD83C\uDFB2 ???',
      freeze: '\uD83E\uDDCA FREEZE!',
      shrink: '\uD83D\uDD0D SHRINK!',
      skull: '\u2620\uFE0F -1 LIFE!',
      grow: '\uD83C\uDF44 GROW!',
      fusion: '\uD83D\uDD17 FUSION!',
      fission_pu: '\u269B\uFE0F FISSION!',
      wave: '\u3030\uFE0F WAVE!',
      web: '\uD83D\uDD78\uFE0F WEB!',
      portal: '\uD83C\uDF00 PORTAL!',
      sinkhole: '\uD83D\uDD73\uFE0F SINKHOLE!',
      snake: '\uD83D\uDC0D SNAKE!',
      jackpot: '\uD83D\uDCB2 JACKPOT!',
      magnet: '\uD83E\uDDF2 MAGNET!',
      candy: '\uD83C\uDF6C CANDY!',
      fire: '\uD83D\uDD25 FIRE!',
      acid: '\uD83E\uDDEA ACID!',
      anchor: '\u2693 ANCHOR!'
    };
    var textColorMap = {
      heart: '#ff6699',
      clock: '#66ddff',
      shield: '#88aaff',
      lightning: '#ffdd44',
      bomb: '#ff6600',
      mystery: '#ff88ff',
      freeze: '#aaeeff',
      shrink: '#cc66ff',
      skull: '#ff2222',
      grow: '#ff6600',
      fusion: '#ffcc33',
      fission_pu: '#ff4400',
      wave: '#22ccee',
      web: '#ddddee',
      portal: '#cc66ff',
      sinkhole: '#8822cc',
      snake: '#33ff55',
      jackpot: '#ffd700',
      magnet: '#dd4444',
      candy: '#ff69b4',
      fire: '#ff4500',
      acid: '#39ff14',
      anchor: '#4682b4'
    };

    var text, textColor;
    if (isFruit) {
      var pts = points || 0;
      text = '+' + pts;
      textColor = '#ffdd44';
    } else {
      text = textMap[kind] || kind;
      textColor = textColorMap[kind] || '#ffffff';
    }

    powerUpTexts.push({
      x: x,
      y: y + PLAY_Y_OFFSET - 10,
      text: text,
      color: textColor,
      life: 1.0,
      maxLife: kind === 'jackpot' ? 2.5 : 1.2,
      fontSize: kind === 'jackpot' ? 28 : 16
    });
  }

  /**
   * Add a secondary explosion effect at a remote position (e.g. bomb destroying a ball).
   */
  function addBombExplosionAt(x, y) {
    var count = 24 + Math.floor(Math.random() * 8);
    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
      var speed = 60 + Math.random() * 120;
      powerUpParticles.push({
        x: x,
        y: y + PLAY_Y_OFFSET,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.3 + Math.random() * 0.3,
        color: BOMB_COLORS[Math.floor(Math.random() * BOMB_COLORS.length)],
        size: 2.5 + Math.random() * 3
      });
    }
    fissionFlashes.push({
      x: x,
      y: y + PLAY_Y_OFFSET,
      radius: 8,
      maxRadius: 50,
      life: 1.0,
      decay: 2.5
    });
  }

  /**
   * MASSIVE nuke explosion effect — the biggest explosion in the game.
   * Expanding white shockwave, 80+ particles, screen shake, screen flash, rising text.
   */
  function addNukeExplosion(x, y, blastRadius) {
    var screenY = y + PLAY_Y_OFFSET;
    blastRadius = blastRadius || 150;

    // White screen flash
    nukeFlashAlpha = 0.85;

    // Big screen shake
    triggerShake(10, 500);

    // Expanding white shockwave ring
    nukeShockwaves.push({
      x: x,
      y: screenY,
      radius: 5,
      maxRadius: blastRadius,
      life: 1.0,
      decay: 1.6
    });

    // Primary blast particles — 80+ white/yellow/orange in all directions
    var primaryCount = 80 + Math.floor(Math.random() * 20);
    for (var i = 0; i < primaryCount; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES * 2) break;
      var angle = (Math.PI * 2 / primaryCount) * i + (Math.random() - 0.5) * 0.7;
      var speed = 80 + Math.random() * 200;
      powerUpParticles.push({
        x: x,
        y: screenY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.5 + Math.random() * 0.5,
        color: NUKE_COLORS[Math.floor(Math.random() * NUKE_COLORS.length)],
        size: 3 + Math.random() * 4
      });
    }

    // Secondary ring of particles that expands outward in a delayed ring
    var ringCount = 40 + Math.floor(Math.random() * 10);
    for (var r = 0; r < ringCount; r++) {
      var rAngle = (Math.PI * 2 / ringCount) * r + (Math.random() - 0.5) * 0.3;
      var rSpeed = 120 + Math.random() * 100;
      nukeSecondaryRing.push({
        x: x,
        y: screenY,
        vx: Math.cos(rAngle) * rSpeed,
        vy: Math.sin(rAngle) * rSpeed,
        life: 1.0,
        maxLife: 0.6 + Math.random() * 0.4,
        color: NUKE_COLORS[Math.floor(Math.random() * NUKE_COLORS.length)],
        size: 2 + Math.random() * 3
      });
    }

    // Central flash ring (larger than bomb)
    fissionFlashes.push({
      x: x,
      y: screenY,
      radius: 15,
      maxRadius: blastRadius * 0.8,
      life: 1.0,
      decay: 1.2
    });

    // Rising "☢️ NUKE!" text — large and dramatic
    powerUpTexts.push({
      x: x,
      y: screenY - 20,
      text: '\u2622\uFE0F NUKE!',
      color: '#ffee44',
      life: 1.0,
      maxLife: 2.5,
      fontSize: 32
    });
  }

  /**
   * Update the floating text of a mystery power-up after resolution.
   */
  function resolveMysteryText(resolvedKind) {
    for (var i = powerUpTexts.length - 1; i >= 0; i--) {
      if (powerUpTexts[i].text === '\uD83C\uDFB2 ???') {
        var resolvedMap = {
          heart: '\u2764\uFE0F +1 LIFE',
          clock: '\u23F1\uFE0F SLOW!',
          shield: '\uD83D\uDEE1\uFE0F SHIELD!',
          lightning: '\u26A1 SPEED!',
          bomb: '\uD83D\uDCA3 BOOM!',
          freeze: '\uD83E\uDDCA FREEZE!',
          shrink: '\uD83D\uDD0D SHRINK!',
          skull: '\u2620\uFE0F -1 LIFE!',
          grow: '\uD83C\uDF44 GROW!',
          web: '\uD83D\uDD78\uFE0F WEB!',
          portal: '\uD83C\uDF00 PORTAL!',
          sinkhole: '\uD83D\uDD73\uFE0F SINKHOLE!',
          snake: '\uD83D\uDC0D SNAKE!',
          nuke: '\u2622\uFE0F NUKE!',
          fusion: '\uD83D\uDD17 FUSION!',
          fission_pu: '\u269B\uFE0F FISSION!',
          wave: '\u3030\uFE0F WAVE!',
          magnet: '\uD83E\uDDF2 MAGNET!',
          fire: '\uD83D\uDD25 FIRE!',
          acid: '\uD83E\uDDEA ACID!'
        };
        powerUpTexts[i].text = resolvedMap[resolvedKind] || ('\uD83C\uDFB2 ' + resolvedKind);
        powerUpTexts[i].color = '#ffffff';
        break;
      }
    }
  }

  // ── Mystery box reveal animation ──

  var mysteryReveals = [];

  var MYSTERY_SLOT_EMOJIS = [
    '\u2764\uFE0F',        // heart
    '\u23F1\uFE0F',        // clock
    '\uD83D\uDEE1\uFE0F',  // shield
    '\u26A1',               // lightning
    '\uD83D\uDCA3',         // bomb
    '\uD83E\uDDCA',         // freeze
    '\uD83D\uDD0D',         // shrink
    '\u2620\uFE0F',         // skull
    '\uD83C\uDF44',         // grow (mushroom)
    '\uD83D\uDD17',         // fusion
    '\uD83D\uDD78\uFE0F',    // web
    '\uD83C\uDF00',            // portal
    '\uD83D\uDD73\uFE0F',      // sinkhole
    '\uD83D\uDC0D',              // snake
    '\u2622\uFE0F',               // nuke
    '\u269B\uFE0F',               // fission
    '\u3030\uFE0F',               // wave
    '\uD83E\uDDF2',               // magnet
    '\uD83C\uDF6C',                // candy
    '\uD83D\uDD25',                // fire
    '\uD83E\uDDEA',                // acid
    '\u2693'                        // anchor
  ];

  var MYSTERY_RESOLVED_EMOJI = {
    heart: '\u2764\uFE0F',
    clock: '\u23F1\uFE0F',
    shield: '\uD83D\uDEE1\uFE0F',
    lightning: '\u26A1',
    bomb: '\uD83D\uDCA3',
    freeze: '\uD83E\uDDCA',
    shrink: '\uD83D\uDD0D',
    skull: '\u2620\uFE0F',
    grow: '\uD83C\uDF44',
    fusion: '\uD83D\uDD17',
    fission_pu: '\u269B\uFE0F',
    wave: '\u3030\uFE0F',
    web: '\uD83D\uDD78\uFE0F',
    portal: '\uD83C\uDF00',
    sinkhole: '\uD83D\uDD73\uFE0F',
    snake: '\uD83D\uDC0D',
    nuke: '\u2622\uFE0F',
    magnet: '\uD83E\uDDF2',
    candy: '\uD83C\uDF6C',
    fire: '\uD83D\uDD25',
    acid: '\uD83E\uDDEA',
    anchor: '\u2693'
  };

  /**
   * Queue a mystery box slot-machine reveal animation.
   * Rapidly flashes random item emojis, then lands on the resolved one with a glow.
   */
  function addMysteryRevealEffect(x, y, resolvedKind) {
    var slotCount = 4;
    var slots = [];
    for (var i = 0; i < slotCount; i++) {
      slots.push(MYSTERY_SLOT_EMOJIS[Math.floor(Math.random() * MYSTERY_SLOT_EMOJIS.length)]);
    }
    mysteryReveals.push({
      x: x,
      y: y + PLAY_Y_OFFSET,
      resolvedKind: resolvedKind,
      resolvedEmoji: MYSTERY_RESOLVED_EMOJI[resolvedKind] || '\uD83C\uDFB2',
      slots: slots,
      slotIndex: 0,
      startTime: performance.now(),
      slotInterval: 100,
      holdDuration: 1000,
      phase: 'spinning',     // 'spinning' | 'landed' | 'done'
      landedAt: 0
    });
  }

  function updateMysteryReveals() {
    var now = performance.now();
    for (var i = mysteryReveals.length - 1; i >= 0; i--) {
      var mr = mysteryReveals[i];
      if (mr.phase === 'spinning') {
        var elapsed = now - mr.startTime;
        var nextIndex = Math.floor(elapsed / mr.slotInterval);
        if (nextIndex >= mr.slots.length) {
          mr.phase = 'landed';
          mr.landedAt = now;
        } else {
          mr.slotIndex = nextIndex;
        }
      } else if (mr.phase === 'landed') {
        if (now - mr.landedAt > mr.holdDuration) {
          mr.phase = 'done';
          // Fire the normal capture effect for the resolved kind
          addPowerUpEffect(mr.x, mr.y - PLAY_Y_OFFSET, mr.resolvedKind);
        }
      } else {
        mysteryReveals.splice(i, 1);
      }
    }
  }

  function drawMysteryReveals(ctx) {
    var now = performance.now();
    for (var i = 0; i < mysteryReveals.length; i++) {
      var mr = mysteryReveals[i];
      var emoji;
      var glowAlpha = 0;
      var scale = 1.0;

      if (mr.phase === 'spinning') {
        emoji = mr.slots[mr.slotIndex];
        // Quick flash scale
        var flashT = ((now - mr.startTime) % mr.slotInterval) / mr.slotInterval;
        scale = 0.8 + 0.4 * Math.abs(Math.sin(flashT * Math.PI));
      } else if (mr.phase === 'landed') {
        emoji = mr.resolvedEmoji;
        var holdElapsed = now - mr.landedAt;
        var holdProgress = Math.min(holdElapsed / mr.holdDuration, 1.0);
        // Grow in, then fade out at end
        scale = 1.2 + 0.2 * Math.sin(holdProgress * Math.PI);
        glowAlpha = holdProgress < 0.8 ? 0.5 : 0.5 * (1.0 - (holdProgress - 0.8) / 0.2);
      }

      ctx.save();

      // Glow behind the resolved emoji
      if (glowAlpha > 0) {
        var glowGrad = ctx.createRadialGradient(mr.x, mr.y, 4, mr.x, mr.y, 36);
        glowGrad.addColorStop(0, 'rgba(255, 136, 255, ' + glowAlpha + ')');
        glowGrad.addColorStop(1, 'rgba(255, 136, 255, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(mr.x, mr.y, 36, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw the emoji
      var fontSize = Math.round(24 * scale);
      ctx.font = fontSize + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff88ff';
      ctx.shadowBlur = mr.phase === 'landed' ? 16 : 6;
      ctx.fillText(emoji, mr.x, mr.y);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  /**
   * Update power-up particles and floating texts.
   */
  function updatePowerUpEffects(dt) {
    for (var i = powerUpParticles.length - 1; i >= 0; i--) {
      var p = powerUpParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        powerUpParticles.splice(i, 1);
      }
    }

    for (var j = powerUpTexts.length - 1; j >= 0; j--) {
      var t = powerUpTexts[j];
      t.y -= 40 * dt; // float upward
      t.life -= dt / t.maxLife;
      if (t.life <= 0) {
        powerUpTexts.splice(j, 1);
      }
    }

    // Update mystery reveal slot-machine animations
    updateMysteryReveals();
  }

  /**
   * Draw power-up capture particles and floating text.
   */
  function drawPowerUpEffects(ctx) {
    // Particles
    for (var i = 0; i < powerUpParticles.length; i++) {
      var p = powerUpParticles[i];
      var a = Math.max(0, p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Jackpot ambient sparkles (around the item on the field)
    var dt = 0.016;
    for (var si = jackpotSparkles.length - 1; si >= 0; si--) {
      var sp = jackpotSparkles[si];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt / sp.maxLife;
      if (sp.life <= 0) { jackpotSparkles.splice(si, 1); continue; }
      ctx.globalAlpha = sp.life * 0.8;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Jackpot golden screen flash
    if (jackpotFlashAlpha > 0.005) {
      ctx.fillStyle = 'rgba(255, 215, 0, ' + jackpotFlashAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      jackpotFlashAlpha *= 0.92;
      if (jackpotFlashAlpha < 0.005) jackpotFlashAlpha = 0;
    }

    // Jackpot golden rain particles
    for (var ri = jackpotRainParticles.length - 1; ri >= 0; ri--) {
      var rp = jackpotRainParticles[ri];
      rp.x += rp.vx * dt;
      rp.y += rp.vy * dt;
      rp.vy += 40 * dt; // gravity
      rp.life -= dt / rp.maxLife;
      if (rp.life <= 0 || rp.y > CANVAS_HEIGHT + 10) { jackpotRainParticles.splice(ri, 1); continue; }
      ctx.globalAlpha = Math.max(0, rp.life) * 0.9;
      ctx.fillStyle = rp.color;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.size * (0.5 + 0.5 * rp.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Nuke white screen flash
    if (nukeFlashAlpha > 0.005) {
      ctx.fillStyle = 'rgba(255, 255, 255, ' + nukeFlashAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      nukeFlashAlpha *= 0.88;
      if (nukeFlashAlpha < 0.005) nukeFlashAlpha = 0;
    }

    // Nuke shockwave rings
    for (var sw = nukeShockwaves.length - 1; sw >= 0; sw--) {
      var wave = nukeShockwaves[sw];
      wave.life -= dt * wave.decay;
      if (wave.life <= 0) { nukeShockwaves.splice(sw, 1); continue; }
      var waveR = wave.maxRadius * (1 - wave.life) + wave.radius;
      var waveAlpha = wave.life * 0.7;
      ctx.save();
      ctx.globalAlpha = waveAlpha;
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + waveAlpha.toFixed(3) + ')';
      ctx.lineWidth = 3 + wave.life * 4;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, waveR, 0, Math.PI * 2);
      ctx.stroke();
      // Inner glow fill
      ctx.globalAlpha = waveAlpha * 0.15;
      ctx.fillStyle = 'rgba(255, 240, 180, ' + (waveAlpha * 0.15).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, waveR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Nuke secondary ring particles
    for (var nr = nukeSecondaryRing.length - 1; nr >= 0; nr--) {
      var np = nukeSecondaryRing[nr];
      np.x += np.vx * dt;
      np.y += np.vy * dt;
      np.vx *= 0.96;
      np.vy *= 0.96;
      np.life -= dt / np.maxLife;
      if (np.life <= 0) { nukeSecondaryRing.splice(nr, 1); continue; }
      ctx.globalAlpha = Math.max(0, np.life) * 0.9;
      ctx.fillStyle = np.color;
      ctx.beginPath();
      ctx.arc(np.x, np.y, np.size * (0.4 + 0.6 * np.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Floating text
    for (var j = 0; j < powerUpTexts.length; j++) {
      var t = powerUpTexts[j];
      var alpha = Math.max(0, t.life);
      var fontSize = t.fontSize || 16;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold ' + fontSize + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = fontSize > 16 ? 16 : 8;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Mystery box slot-machine reveals
    drawMysteryReveals(ctx);
  }

  /**
   * Draw a pulsing blue overlay when slow-motion is active.
   */
  function drawSlowOverlay(ctx, isSlowed) {
    var now = performance.now();
    var dt = lastSlowFrameTime
      ? Math.min((now - lastSlowFrameTime) / 1000, 0.1)
      : 0.016;
    lastSlowFrameTime = now;

    var target = isSlowed ? 1 : 0;
    slowLevel += (target - slowLevel) * Math.min(dt * 4.0, 1);

    if (slowLevel < 0.005) {
      slowLevel = 0;
      return;
    }

    // Gentle blue pulse at ~1 Hz
    var pulse = Math.sin(now * 0.006);
    var blue = Math.round(180 + 30 * pulse);
    var alpha = (0.12 + 0.04 * pulse) * slowLevel;

    // Clip all overlay drawing to the current shape
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    // Flat blue tint
    ctx.fillStyle = 'rgba(0, 60, ' + blue + ', ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Blue vignette border glow
    var vigAlpha = (0.3 + 0.1 * pulse) * slowLevel;
    var edgeW = 40;

    // Top edge
    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(0, 120, 255, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(0, 120, 255, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    // Bottom edge
    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(0, 120, 255, 0)');
    gBot.addColorStop(1, 'rgba(0, 120, 255, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    // Left edge
    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(0, 120, 255, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(0, 120, 255, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    // Right edge
    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(0, 120, 255, 0)');
    gRight.addColorStop(1, 'rgba(0, 120, 255, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    ctx.restore();
  }

  /**
   * Draw a subtle blue shimmer border when shield is active.
   */
  function drawShieldOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastShieldFrameTime
      ? Math.min((now - lastShieldFrameTime) / 1000, 0.1)
      : 0.016;
    lastShieldFrameTime = now;

    var target = isActive ? 1 : 0;
    shieldLevel += (target - shieldLevel) * Math.min(dt * 4.0, 1);

    if (shieldLevel < 0.005) {
      shieldLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.005);
    var shimmer = Math.sin(now * 0.02) * 0.5 + 0.5;
    var alpha = (0.2 + 0.1 * pulse) * shieldLevel;
    var edgeW = 6;
    var blue = Math.round(180 + 60 * shimmer);
    var color = 'rgba(100, ' + blue + ', 255, ' + alpha.toFixed(3) + ')';

    // Top
    ctx.fillStyle = color;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);
    // Bottom
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);
    // Left
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);
    // Right
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    // Corner glints
    var glintAlpha = (0.4 + 0.3 * shimmer) * shieldLevel;
    var glintR = 12;
    ctx.fillStyle = 'rgba(170, 210, 255, ' + glintAlpha.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(0, PLAY_Y_OFFSET, glintR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(PLAY_WIDTH, PLAY_Y_OFFSET, glintR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, PLAY_Y_OFFSET + PLAY_HEIGHT, glintR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(PLAY_WIDTH, PLAY_Y_OFFSET + PLAY_HEIGHT, glintR, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw subtle yellow electric arcs/sparks at edges when lightning is active.
   */
  function drawLightningOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastLightningFrameTime
      ? Math.min((now - lastLightningFrameTime) / 1000, 0.1)
      : 0.016;
    lastLightningFrameTime = now;

    var target = isActive ? 1 : 0;
    lightningLevel += (target - lightningLevel) * Math.min(dt * 4.0, 1);

    if (lightningLevel < 0.005) {
      lightningLevel = 0;
      return;
    }

    ctx.save();
    ctx.lineWidth = 1.5;

    // Draw small electric arcs along each edge
    var numArcs = 6;
    var arcLen = 18;
    var edges = [
      { x1: 0, y1: PLAY_Y_OFFSET, x2: PLAY_WIDTH, y2: PLAY_Y_OFFSET, dir: 'h' },
      { x1: 0, y1: PLAY_Y_OFFSET + PLAY_HEIGHT, x2: PLAY_WIDTH, y2: PLAY_Y_OFFSET + PLAY_HEIGHT, dir: 'h' },
      { x1: 0, y1: PLAY_Y_OFFSET, x2: 0, y2: PLAY_Y_OFFSET + PLAY_HEIGHT, dir: 'v' },
      { x1: PLAY_WIDTH, y1: PLAY_Y_OFFSET, x2: PLAY_WIDTH, y2: PLAY_Y_OFFSET + PLAY_HEIGHT, dir: 'v' }
    ];

    for (var e = 0; e < edges.length; e++) {
      var edge = edges[e];
      for (var i = 0; i < numArcs; i++) {
        // Stagger arcs with time-based random seed
        var seed = Math.sin(now * 0.01 + i * 7.3 + e * 13.1);
        if (seed < 0.2) continue; // only draw some arcs each frame

        var t = (i + 0.5) / numArcs;
        var bx, by;
        if (edge.dir === 'h') {
          bx = edge.x1 + (edge.x2 - edge.x1) * t;
          by = edge.y1;
        } else {
          bx = edge.x1;
          by = edge.y1 + (edge.y2 - edge.y1) * t;
        }

        var sparkAlpha = (0.4 + 0.4 * Math.sin(now * 0.03 + i * 2.1)) * lightningLevel;
        ctx.strokeStyle = 'rgba(255, 238, 68, ' + sparkAlpha.toFixed(3) + ')';
        ctx.shadowColor = 'rgba(255, 238, 68, ' + (sparkAlpha * 0.8).toFixed(3) + ')';
        ctx.shadowBlur = 6;

        ctx.beginPath();
        ctx.moveTo(bx, by);
        var segs = 3;
        for (var s = 1; s <= segs; s++) {
          var jx = (Math.sin(now * 0.05 + i * 3.7 + s * 5.3 + e) * 2 - 1) * 6;
          var jy = (Math.sin(now * 0.04 + i * 2.3 + s * 4.1 + e) * 2 - 1) * 6;
          var inward = (edge.dir === 'h')
            ? (edge.y1 === PLAY_Y_OFFSET ? 1 : -1)
            : (edge.x1 === 0 ? 1 : -1);
          if (edge.dir === 'h') {
            ctx.lineTo(bx + jx + (s / segs) * arcLen * 0.3, by + Math.abs(jy) * inward);
          } else {
            ctx.lineTo(bx + Math.abs(jx) * inward, by + jy + (s / segs) * arcLen * 0.3);
          }
        }
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Draw a frost/ice overlay when freeze is active — white-blue tint with corner crystals.
   */
  function drawFreezeOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastFreezeFrameTime
      ? Math.min((now - lastFreezeFrameTime) / 1000, 0.1)
      : 0.016;
    lastFreezeFrameTime = now;

    var target = isActive ? 1 : 0;
    freezeLevel += (target - freezeLevel) * Math.min(dt * 4.0, 1);

    if (freezeLevel < 0.005) {
      freezeLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.005);

    // Clip all overlay drawing to the current shape
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    // White-blue tint overlay
    var blue = Math.round(220 + 20 * pulse);
    var alpha = (0.10 + 0.03 * pulse) * freezeLevel;
    ctx.fillStyle = 'rgba(200, 230, ' + blue + ', ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Icy border glow
    var vigAlpha = (0.35 + 0.1 * pulse) * freezeLevel;
    var edgeW = 35;

    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(180, 230, 255, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(180, 230, 255, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(180, 230, 255, 0)');
    gBot.addColorStop(1, 'rgba(180, 230, 255, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(180, 230, 255, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(180, 230, 255, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(180, 230, 255, 0)');
    gRight.addColorStop(1, 'rgba(180, 230, 255, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    // Ice crystal decorations at corners
    var crystalAlpha = (0.5 + 0.2 * pulse) * freezeLevel;
    ctx.strokeStyle = 'rgba(200, 240, 255, ' + crystalAlpha.toFixed(3) + ')';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(180, 230, 255, ' + (crystalAlpha * 0.6).toFixed(3) + ')';
    ctx.shadowBlur = 6;

    var corners = [
      { x: 0, y: PLAY_Y_OFFSET, dx: 1, dy: 1 },
      { x: PLAY_WIDTH, y: PLAY_Y_OFFSET, dx: -1, dy: 1 },
      { x: 0, y: PLAY_Y_OFFSET + PLAY_HEIGHT, dx: 1, dy: -1 },
      { x: PLAY_WIDTH, y: PLAY_Y_OFFSET + PLAY_HEIGHT, dx: -1, dy: -1 }
    ];
    var crystalLen = 25 * freezeLevel;
    for (var ci = 0; ci < corners.length; ci++) {
      var c = corners[ci];
      for (var li = 0; li < 3; li++) {
        var ang = (li * 0.35 + 0.15) * (Math.PI / 2);
        var endX = c.x + Math.cos(ang) * c.dx * crystalLen;
        var endY = c.y + Math.sin(ang) * c.dy * crystalLen;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        var midX = c.x + Math.cos(ang) * c.dx * crystalLen * 0.6;
        var midY = c.y + Math.sin(ang) * c.dy * crystalLen * 0.6;
        var branchAng = ang + 0.5 * c.dx * c.dy;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(midX + Math.cos(branchAng) * c.dx * 8, midY + Math.sin(branchAng) * c.dy * 8);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Draw a subtle purple tint overlay when shrink is active.
   */
  function drawShrinkOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastShrinkFrameTime
      ? Math.min((now - lastShrinkFrameTime) / 1000, 0.1)
      : 0.016;
    lastShrinkFrameTime = now;

    var target = isActive ? 1 : 0;
    shrinkLevel += (target - shrinkLevel) * Math.min(dt * 4.0, 1);

    if (shrinkLevel < 0.005) {
      shrinkLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.006);
    var alpha = (0.08 + 0.03 * pulse) * shrinkLevel;
    var purple = Math.round(140 + 20 * pulse);

    // Clip all overlay drawing to the current shape
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    ctx.fillStyle = 'rgba(' + purple + ', 40, 180, ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Subtle purple vignette at edges
    var vigAlpha = (0.2 + 0.08 * pulse) * shrinkLevel;
    var edgeW = 25;

    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(160, 60, 220, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(160, 60, 220, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(160, 60, 220, 0)');
    gBot.addColorStop(1, 'rgba(160, 60, 220, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(160, 60, 220, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(160, 60, 220, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(160, 60, 220, 0)');
    gRight.addColorStop(1, 'rgba(160, 60, 220, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    ctx.restore();
  }

  /**
   * Draw a subtle orange tint overlay when grow is active.
   */
  function drawGrowOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastGrowFrameTime
      ? Math.min((now - lastGrowFrameTime) / 1000, 0.1)
      : 0.016;
    lastGrowFrameTime = now;

    var target = isActive ? 1 : 0;
    growLevel += (target - growLevel) * Math.min(dt * 4.0, 1);

    if (growLevel < 0.005) {
      growLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.006);
    var alpha = (0.08 + 0.03 * pulse) * growLevel;
    var red = Math.round(220 + 20 * pulse);

    // Clip all overlay drawing to the current shape
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    ctx.fillStyle = 'rgba(' + red + ', 80, 0, ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Subtle orange vignette at edges
    var vigAlpha = (0.2 + 0.08 * pulse) * growLevel;
    var edgeW = 25;

    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(220, 80, 0, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(220, 80, 0, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(220, 80, 0, 0)');
    gBot.addColorStop(1, 'rgba(220, 80, 0, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(220, 80, 0, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(220, 80, 0, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(220, 80, 0, 0)');
    gRight.addColorStop(1, 'rgba(220, 80, 0, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    ctx.restore();
  }

  /**
   * Add merge implosion effect — particles pull INWARD + bright flash.
   */
  function addMergeEffect(x, y) {
    var MERGE_COLORS = ['#ffcc00', '#ffaa22', '#dd8800', '#ffdd55', '#ffffff'];
    var count = 20 + Math.floor(Math.random() * 6);
    var spawnRadius = 40 + Math.random() * 15;

    for (var i = 0; i < count; i++) {
      if (mergeParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;

      mergeParticles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + PLAY_Y_OFFSET + Math.sin(angle) * spawnRadius,
        cx: x,
        cy: y + PLAY_Y_OFFSET,
        life: 1.0,
        maxLife: 0.35 + Math.random() * 0.15,
        color: MERGE_COLORS[Math.floor(Math.random() * MERGE_COLORS.length)],
        size: 2 + Math.random() * 2.5
      });
    }

    // Bright center flash
    fissionFlashes.push({
      x: x,
      y: y + PLAY_Y_OFFSET,
      radius: 3,
      maxRadius: 30 + Math.random() * 10,
      life: 1.0,
      decay: 3.5
    });
  }

  /**
   * Draw web zones on the play area — semi-transparent spider web patterns.
   * Each zone is {x, y, radius, timer}.
   */
  function drawWebZones(ctx, webZones) {
    if (!webZones || !webZones.length) return;

    var now = performance.now();

    for (var wi = 0; wi < webZones.length; wi++) {
      var zone = webZones[wi];
      var sx = zone.x;
      var sy = zone.y + PLAY_Y_OFFSET;
      var r = zone.radius;
      var timer = zone.timer != null ? zone.timer : 15;

      // Fade out during last 3 seconds
      var fadeAlpha = timer < 3 ? (timer / 3) : 1.0;
      // Subtle shimmer/pulse
      var pulse = 0.85 + 0.15 * Math.sin(now * 0.004 + wi * 2.1);
      var baseAlpha = 0.15 * fadeAlpha * pulse;

      ctx.save();
      ctx.globalAlpha = baseAlpha;

      // Clip to zone circle
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.save();
      ctx.clip();

      // Radial gradient fill for soft glow
      var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, 'rgba(220, 220, 235, 0.3)');
      glow.addColorStop(0.7, 'rgba(200, 200, 220, 0.1)');
      glow.addColorStop(1, 'rgba(180, 180, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fill();

      // Draw concentric web rings (organic spacing)
      ctx.strokeStyle = 'rgba(230, 230, 245, 0.7)';
      ctx.lineWidth = 1;
      var ringCount = 5;
      for (var ri = 1; ri <= ringCount; ri++) {
        var ringR = (r / (ringCount + 1)) * ri;
        // Slightly wobbly rings for organic feel
        ctx.beginPath();
        var segments = 36;
        for (var si = 0; si <= segments; si++) {
          var ang = (Math.PI * 2 / segments) * si;
          var wobble = 1 + 0.04 * Math.sin(ang * 5 + ri * 1.3 + now * 0.002);
          var px = sx + Math.cos(ang) * ringR * wobble;
          var py = sy + Math.sin(ang) * ringR * wobble;
          if (si === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Radial spokes (like a spider web)
      var spokeCount = 12;
      ctx.strokeStyle = 'rgba(230, 230, 245, 0.6)';
      ctx.lineWidth = 0.8;
      for (var spi = 0; spi < spokeCount; spi++) {
        var spokeAng = (Math.PI * 2 / spokeCount) * spi;
        // Slightly curved spokes
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        var cp1x = sx + Math.cos(spokeAng + 0.08) * r * 0.5;
        var cp1y = sy + Math.sin(spokeAng + 0.08) * r * 0.5;
        var ex = sx + Math.cos(spokeAng) * r;
        var ey = sy + Math.sin(spokeAng) * r;
        ctx.quadraticCurveTo(cp1x, cp1y, ex, ey);
        ctx.stroke();
      }

      ctx.restore(); // unclip

      // Outer edge glow ring
      ctx.strokeStyle = 'rgba(200, 200, 220, ' + (0.25 * fadeAlpha * pulse).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(220, 220, 240, ' + (0.3 * fadeAlpha).toFixed(3) + ')';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();
    }
  }

  /**
   * Draw a warm golden/amber overlay when fusion is active.
   */
  function drawFusionOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastFusionFrameTime
      ? Math.min((now - lastFusionFrameTime) / 1000, 0.1)
      : 0.016;
    lastFusionFrameTime = now;

    var target = isActive ? 1 : 0;
    fusionLevel += (target - fusionLevel) * Math.min(dt * 4.0, 1);

    if (fusionLevel < 0.005) {
      fusionLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.004);
    var alpha = (0.07 + 0.025 * pulse) * fusionLevel;

    // Clip all overlay drawing to the current shape
    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    // Warm amber tint
    ctx.fillStyle = 'rgba(220, 170, 40, ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Golden border glow
    var vigAlpha = (0.25 + 0.08 * pulse) * fusionLevel;
    var edgeW = 28;

    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(220, 170, 40, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(220, 170, 40, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(220, 170, 40, 0)');
    gBot.addColorStop(1, 'rgba(220, 170, 40, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(220, 170, 40, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(220, 170, 40, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(220, 170, 40, 0)');
    gRight.addColorStop(1, 'rgba(220, 170, 40, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    // Honey drip decorations at top edge
    var dripAlpha = (0.4 + 0.15 * pulse) * fusionLevel;
    ctx.fillStyle = 'rgba(200, 150, 20, ' + dripAlpha.toFixed(3) + ')';
    var dripCount = 6;
    for (var di = 0; di < dripCount; di++) {
      var dripX = (PLAY_WIDTH / (dripCount + 1)) * (di + 1);
      var dripLen = (12 + 8 * Math.sin(now * 0.003 + di * 1.5)) * fusionLevel;
      ctx.beginPath();
      ctx.moveTo(dripX - 6, PLAY_Y_OFFSET);
      ctx.lineTo(dripX + 6, PLAY_Y_OFFSET);
      ctx.quadraticCurveTo(dripX + 4, PLAY_Y_OFFSET + dripLen * 0.6, dripX, PLAY_Y_OFFSET + dripLen);
      ctx.quadraticCurveTo(dripX - 4, PLAY_Y_OFFSET + dripLen * 0.6, dripX - 6, PLAY_Y_OFFSET);
      ctx.fill();
    }

    ctx.restore();
  }

  /**
   * Draw a subtle red/orange pulsing overlay when fission is active (danger!).
   */
  function drawFissionOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastFissionPuFrameTime
      ? Math.min((now - lastFissionPuFrameTime) / 1000, 0.1)
      : 0.016;
    lastFissionPuFrameTime = now;

    var target = isActive ? 1 : 0;
    fissionPuLevel += (target - fissionPuLevel) * Math.min(dt * 4.0, 1);

    if (fissionPuLevel < 0.005) {
      fissionPuLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.007);
    var alpha = (0.06 + 0.03 * pulse) * fissionPuLevel;
    var red = Math.round(240 + 15 * pulse);

    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    ctx.fillStyle = 'rgba(' + red + ', 60, 0, ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Red/orange vignette at edges
    var vigAlpha = (0.22 + 0.08 * pulse) * fissionPuLevel;
    var edgeW = 22;

    var gTop = ctx.createLinearGradient(0, PLAY_Y_OFFSET, 0, PLAY_Y_OFFSET + edgeW);
    gTop.addColorStop(0, 'rgba(255, 60, 0, ' + vigAlpha.toFixed(3) + ')');
    gTop.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = gTop;
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, edgeW);

    var gBot = ctx.createLinearGradient(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, 0, PLAY_Y_OFFSET + PLAY_HEIGHT);
    gBot.addColorStop(0, 'rgba(255, 60, 0, 0)');
    gBot.addColorStop(1, 'rgba(255, 60, 0, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW, PLAY_WIDTH, edgeW);

    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(255, 60, 0, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(255, 60, 0, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(255, 60, 0, 0)');
    gRight.addColorStop(1, 'rgba(255, 60, 0, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    ctx.restore();
  }

  /**
   * Draw a wavy blue tint overlay when wave is active.
   */
  function drawWaveOverlay(ctx, isActive) {
    var now = performance.now();
    var dt = lastWaveFrameTime
      ? Math.min((now - lastWaveFrameTime) / 1000, 0.1)
      : 0.016;
    lastWaveFrameTime = now;

    var target = isActive ? 1 : 0;
    waveLevel += (target - waveLevel) * Math.min(dt * 4.0, 1);

    if (waveLevel < 0.005) {
      waveLevel = 0;
      return;
    }

    var pulse = Math.sin(now * 0.005);
    var alpha = (0.06 + 0.025 * pulse) * waveLevel;

    ctx.save();
    ctx.beginPath();
    fillShapePath(ctx);
    ctx.clip();

    // Subtle blue tint
    ctx.fillStyle = 'rgba(0, 120, 200, ' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, PLAY_Y_OFFSET, PLAY_WIDTH, PLAY_HEIGHT);

    // Animated wave distortion at edges
    var vigAlpha = (0.2 + 0.08 * pulse) * waveLevel;
    var edgeW = 25;

    // Top wave edge with animated ripple
    for (var wx = 0; wx < PLAY_WIDTH; wx += 4) {
      var waveOff = Math.sin(now * 0.004 + wx * 0.04) * 6 * waveLevel;
      var wAlpha = vigAlpha * (1 - wx / PLAY_WIDTH * 0.3);
      ctx.fillStyle = 'rgba(0, 140, 220, ' + wAlpha.toFixed(3) + ')';
      ctx.fillRect(wx, PLAY_Y_OFFSET + waveOff, 4, edgeW);
    }

    // Bottom wave edge
    for (var bx = 0; bx < PLAY_WIDTH; bx += 4) {
      var bWaveOff = Math.sin(now * 0.004 + bx * 0.04 + 2) * 6 * waveLevel;
      var bAlpha = vigAlpha * (1 - bx / PLAY_WIDTH * 0.3);
      ctx.fillStyle = 'rgba(0, 140, 220, ' + bAlpha.toFixed(3) + ')';
      ctx.fillRect(bx, PLAY_Y_OFFSET + PLAY_HEIGHT - edgeW + bWaveOff, 4, edgeW);
    }

    // Side wave edges
    var gLeft = ctx.createLinearGradient(0, 0, edgeW, 0);
    gLeft.addColorStop(0, 'rgba(0, 140, 220, ' + vigAlpha.toFixed(3) + ')');
    gLeft.addColorStop(1, 'rgba(0, 140, 220, 0)');
    ctx.fillStyle = gLeft;
    ctx.fillRect(0, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    var gRight = ctx.createLinearGradient(PLAY_WIDTH - edgeW, 0, PLAY_WIDTH, 0);
    gRight.addColorStop(0, 'rgba(0, 140, 220, 0)');
    gRight.addColorStop(1, 'rgba(0, 140, 220, ' + vigAlpha.toFixed(3) + ')');
    ctx.fillStyle = gRight;
    ctx.fillRect(PLAY_WIDTH - edgeW, PLAY_Y_OFFSET, edgeW, PLAY_HEIGHT);

    ctx.restore();
  }

  // ── Portal rendering ──

  // Teleport effect particles (separate pool so they don't clash)
  var teleportParticles = [];

  /**
   * Draw a pair of linked portals on the play area.
   * portalPair = { portal_a: {x, y}, portal_b: {x, y}, timer }
   */
  function drawPortals(ctx, portalPair) {
    if (!portalPair) return;

    var now = performance.now();
    var timer = portalPair.timer != null ? portalPair.timer : 10;
    var fadeAlpha = timer < 3 ? (timer / 3) : 1.0;
    // Flicker during last 3s
    var flicker = timer < 3 ? (0.7 + 0.3 * Math.sin(now * 0.03 * (4 - timer))) : 1.0;
    var alpha = fadeAlpha * flicker;

    var a = portalPair.portal_a;
    var b = portalPair.portal_b;
    var ax = a.x, ay = a.y + PLAY_Y_OFFSET;
    var bx = b.x, by = b.y + PLAY_Y_OFFSET;
    var radius = 25;

    // ── Connecting dotted line ──
    ctx.save();
    ctx.globalAlpha = 0.18 * alpha;
    ctx.strokeStyle = '#aa88ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Draw each portal
    drawSinglePortal(ctx, ax, ay, radius, '#4488ff', '#2266dd', alpha, now, 0);
    drawSinglePortal(ctx, bx, by, radius, '#ff8822', '#dd6600', alpha, now, Math.PI);

    // Spawn ambient swirl particles near each portal
    if (teleportParticles.length < MAX_PARTICLES - 4) {
      spawnPortalAmbientParticle(ax, ay, radius, '#4488ff', '#88bbff', alpha);
      spawnPortalAmbientParticle(bx, by, radius, '#ff8822', '#ffaa55', alpha);
    }
  }

  function drawSinglePortal(ctx, cx, cy, radius, color, darkColor, alpha, now, phaseOffset) {
    var rot = (now * 0.003) + phaseOffset;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;

    // Black hole fill
    var holeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    holeGrad.addColorStop(0, '#000000');
    holeGrad.addColorStop(0.7, '#0a0a0a');
    holeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = holeGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner swirl pattern
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    var armCount = 3;
    for (var arm = 0; arm < armCount; arm++) {
      var armAngle = (Math.PI * 2 / armCount) * arm;
      ctx.save();
      ctx.rotate(armAngle);
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 2;
      // Spiral arm
      for (var si = 0; si < 30; si++) {
        var t = si / 30;
        var spiralR = radius * 0.15 + t * radius * 0.7;
        var spiralA = t * Math.PI * 1.5;
        var sx = Math.cos(spiralA) * spiralR;
        var sy = Math.sin(spiralA) * spiralR;
        if (si === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Spinning border ring
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    // Draw two arc segments that rotate
    for (var seg = 0; seg < 2; seg++) {
      var segStart = rot + seg * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, segStart, segStart + Math.PI * 0.7);
      ctx.stroke();
    }

    // Second thinner ring
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha * 0.5;
    for (var seg2 = 0; seg2 < 3; seg2++) {
      var seg2Start = -rot * 1.3 + seg2 * (Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5, seg2Start, seg2Start + Math.PI * 0.4);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function spawnPortalAmbientParticle(cx, cy, radius, color1, color2, alpha) {
    if (Math.random() > 0.3) return; // throttle spawn rate
    var angle = Math.random() * Math.PI * 2;
    var dist = radius + 10 + Math.random() * 15;
    teleportParticles.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      cx: cx,
      cy: cy,
      life: 1.0,
      maxLife: 0.4 + Math.random() * 0.3,
      color: Math.random() > 0.5 ? color1 : color2,
      size: 1 + Math.random() * 2,
      alpha: alpha
    });
  }

  /**
   * Add teleport effect — flash + trail + particles at both ends.
   */
  function addTeleportEffect(fromX, fromY, toX, toY) {
    var sFromY = fromY + PLAY_Y_OFFSET;
    var sToY = toY + PLAY_Y_OFFSET;

    // Flash at entry portal
    fissionFlashes.push({
      x: fromX,
      y: sFromY,
      radius: 5,
      maxRadius: 40,
      life: 1.0,
      decay: 4.0
    });

    // Flash at exit portal
    fissionFlashes.push({
      x: toX,
      y: sToY,
      radius: 5,
      maxRadius: 40,
      life: 1.0,
      decay: 4.0
    });

    // Trail particles along the path
    var trailCount = 12;
    for (var i = 0; i < trailCount; i++) {
      if (teleportParticles.length >= MAX_PARTICLES) break;
      var t = i / trailCount;
      var px = fromX + (toX - fromX) * t;
      var py = sFromY + (sToY - sFromY) * t;
      teleportParticles.push({
        x: px + (Math.random() - 0.5) * 10,
        y: py + (Math.random() - 0.5) * 10,
        cx: px,
        cy: py,
        life: 1.0,
        maxLife: 0.15 + Math.random() * 0.15,
        color: Math.random() > 0.5 ? '#aa66ff' : '#ffaa44',
        size: 2 + Math.random() * 2,
        alpha: 1.0
      });
    }

    // Burst particles at entry (blue-ish)
    var burstColors = ['#4488ff', '#66aaff', '#88ccff', '#ffffff'];
    for (var bi = 0; bi < 10; bi++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var bAngle = (Math.PI * 2 / 10) * bi + (Math.random() - 0.5) * 0.5;
      powerUpParticles.push({
        x: fromX,
        y: sFromY,
        vx: Math.cos(bAngle) * (40 + Math.random() * 60),
        vy: Math.sin(bAngle) * (40 + Math.random() * 60),
        life: 1.0,
        maxLife: 0.25 + Math.random() * 0.15,
        color: burstColors[Math.floor(Math.random() * burstColors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Burst particles at exit (orange-ish)
    var exitColors = ['#ff8822', '#ffaa44', '#ffcc66', '#ffffff'];
    for (var ei = 0; ei < 10; ei++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var eAngle = (Math.PI * 2 / 10) * ei + (Math.random() - 0.5) * 0.5;
      powerUpParticles.push({
        x: toX,
        y: sToY,
        vx: Math.cos(eAngle) * (40 + Math.random() * 60),
        vy: Math.sin(eAngle) * (40 + Math.random() * 60),
        life: 1.0,
        maxLife: 0.25 + Math.random() * 0.15,
        color: exitColors[Math.floor(Math.random() * exitColors.length)],
        size: 2 + Math.random() * 2
      });
    }
  }

  /**
   * Update and draw teleport/portal ambient particles. Call once per frame.
   */
  function updateAndDrawTeleportParticles(ctx, dt) {
    for (var i = teleportParticles.length - 1; i >= 0; i--) {
      var p = teleportParticles[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        teleportParticles.splice(i, 1);
        continue;
      }

      // Spiral inward toward center
      if (p.cx != null) {
        var dx = p.cx - p.x;
        var dy = p.cy - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          var pullSpeed = 80;
          p.x += (dx / dist) * pullSpeed * dt;
          p.y += (dy / dist) * pullSpeed * dt;
          // Tangential spin
          p.x += (-dy / dist) * 40 * dt;
          p.y += (dx / dist) * 40 * dt;
        }
      }

      ctx.save();
      ctx.globalAlpha = p.life * (p.alpha || 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Sinkhole rendering ──

  var sinkholeParticles = [];

  /**
   * Draw the active sinkhole on the play area.
   * sinkhole: {x, y, radius, pull_radius, timer}
   */
  function drawSinkhole(ctx, sinkhole) {
    if (!sinkhole) return;

    var now = performance.now();
    var cx = sinkhole.x;
    var cy = sinkhole.y + PLAY_Y_OFFSET;
    var r = sinkhole.radius || 20;
    var pullR = sinkhole.pull_radius || 80;
    var timer = sinkhole.timer != null ? sinkhole.timer : 10;

    // Fade/flicker in the last 3 seconds
    var fadeAlpha = timer < 3 ? (timer / 3) : 1.0;
    var flicker = timer < 3 ? (0.7 + 0.3 * Math.sin(now * 0.03 * (4 - timer))) : 1.0;
    var alpha = fadeAlpha * flicker;

    var rot = now * 0.004;

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Pull radius: faint concentric dashed circles ──
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 0, 120, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    for (var ring = 1; ring <= 3; ring++) {
      var ringR = r + (pullR - r) * (ring / 3);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ── Spinning dark rings (whirlpool/drain) ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // Outer ring
    ctx.strokeStyle = 'rgba(60, 0, 100, 0.4)';
    ctx.lineWidth = 2.5;
    for (var seg = 0; seg < 3; seg++) {
      var segStart = (Math.PI * 2 / 3) * seg;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, segStart, segStart + Math.PI * 0.5);
      ctx.stroke();
    }
    // Inner ring (counter-rotate)
    ctx.rotate(-rot * 2.6);
    ctx.strokeStyle = 'rgba(100, 0, 160, 0.3)';
    ctx.lineWidth = 1.5;
    for (var seg2 = 0; seg2 < 4; seg2++) {
      var seg2Start = (Math.PI * 2 / 4) * seg2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8, seg2Start, seg2Start + Math.PI * 0.3);
      ctx.stroke();
    }
    ctx.restore();

    // ── Spiral arms inside the void ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * 1.5);
    var armCount = 4;
    for (var arm = 0; arm < armCount; arm++) {
      var armAngle = (Math.PI * 2 / armCount) * arm;
      ctx.save();
      ctx.rotate(armAngle);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(100, 0, 180, 0.25)';
      ctx.lineWidth = 1.5;
      for (var si = 0; si < 20; si++) {
        var t = si / 20;
        var spiralR = r * 0.1 + t * r * 0.85;
        var spiralA = t * Math.PI * 2;
        var sx = Math.cos(spiralA) * spiralR;
        var sy = Math.sin(spiralA) * spiralR;
        if (si === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // ── Dark void center ──
    ctx.shadowColor = '#440066';
    ctx.shadowBlur = 18;
    var voidGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    voidGrad.addColorStop(0, '#000000');
    voidGrad.addColorStop(0.5, '#0a0011');
    voidGrad.addColorStop(0.85, 'rgba(30, 0, 50, 0.7)');
    voidGrad.addColorStop(1, 'rgba(20, 0, 30, 0)');
    ctx.fillStyle = voidGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Ambient particles drifting inward ──
    if (sinkholeParticles.length < MAX_PARTICLES - 6 && Math.random() > 0.4) {
      var spawnAngle = Math.random() * Math.PI * 2;
      var spawnDist = r + 10 + Math.random() * (pullR - r);
      sinkholeParticles.push({
        x: cx + Math.cos(spawnAngle) * spawnDist,
        y: cy + Math.sin(spawnAngle) * spawnDist,
        cx: cx,
        cy: cy,
        life: 1.0,
        maxLife: 0.6 + Math.random() * 0.5,
        color: SINKHOLE_COLORS[Math.floor(Math.random() * SINKHOLE_COLORS.length)],
        size: 1 + Math.random() * 1.5,
        alpha: alpha
      });
    }

    ctx.restore();
  }

  /**
   * Update and draw sinkhole ambient particles. Call once per frame.
   */
  function updateAndDrawSinkholeParticles(ctx, dt) {
    for (var i = sinkholeParticles.length - 1; i >= 0; i--) {
      var p = sinkholeParticles[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) {
        sinkholeParticles.splice(i, 1);
        continue;
      }

      // Pull inward toward sinkhole center
      var dx = p.cx - p.x;
      var dy = p.cy - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        var pullSpeed = 50;
        p.x += (dx / dist) * pullSpeed * dt;
        p.y += (dy / dist) * pullSpeed * dt;
        // Tangential spin
        p.x += (-dy / dist) * 30 * dt;
        p.y += (dx / dist) * 30 * dt;
      }

      ctx.save();
      ctx.globalAlpha = p.life * (p.alpha || 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Sinkhole destroy effect — implosion when a ball is sucked in and crushed.
   */
  function addSinkholeDestroyEffect(x, y) {
    var screenY = y + PLAY_Y_OFFSET;

    // Implosion: particles start spread out and rush inward
    var count = 24 + Math.floor(Math.random() * 8);
    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      var startDist = 30 + Math.random() * 25;
      powerUpParticles.push({
        x: x + Math.cos(angle) * startDist,
        y: screenY + Math.sin(angle) * startDist,
        vx: -Math.cos(angle) * (120 + Math.random() * 80),
        vy: -Math.sin(angle) * (120 + Math.random() * 80),
        life: 1.0,
        maxLife: 0.2 + Math.random() * 0.15,
        color: SINKHOLE_COLORS[Math.floor(Math.random() * SINKHOLE_COLORS.length)],
        size: 2 + Math.random() * 2.5
      });
    }

    // Brief bright flash at center (implosion crunch)
    fissionFlashes.push({
      x: x,
      y: screenY,
      radius: 4,
      maxRadius: 30,
      life: 1.0,
      decay: 4.0
    });
  }

  // ═══════════════════════════════════════════════════════
  //  ACID POOLS  —  Dissolve balls that enter them
  // ═══════════════════════════════════════════════════════

  function drawAcidPools(ctx, acidPools) {
    if (!acidPools || acidPools.length === 0) return;

    var now = performance.now();

    for (var i = 0; i < acidPools.length; i++) {
      var pool = acidPools[i];
      var cx = pool.x;
      var cy = pool.y + PLAY_Y_OFFSET;
      var r = pool.radius || 35;
      var timer = pool.timer != null ? pool.timer : 12;

      // Fade out in last 3 seconds
      var fadeAlpha = timer < 3 ? (timer / 3) : 1.0;
      var flicker = timer < 3 ? (0.7 + 0.3 * Math.sin(now * 0.03 * (4 - timer))) : 1.0;
      var alpha = fadeAlpha * flicker;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Bubbling animation
      var bubblePhase = now * 0.003 + i * 1.5;
      var bubblePulse = 1.0 + 0.08 * Math.sin(bubblePhase);
      var drawR = r * bubblePulse;

      // Main pool — translucent green fill
      var poolGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, drawR);
      poolGrad.addColorStop(0, 'rgba(57, 255, 20, 0.4)');
      poolGrad.addColorStop(0.5, 'rgba(0, 204, 0, 0.3)');
      poolGrad.addColorStop(0.8, 'rgba(50, 205, 50, 0.15)');
      poolGrad.addColorStop(1, 'rgba(57, 255, 20, 0)');
      ctx.fillStyle = poolGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
      ctx.fill();

      // Darker border ring
      ctx.strokeStyle = 'rgba(0, 180, 0, ' + (0.6 * alpha) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, drawR * 0.85, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow ring
      ctx.strokeStyle = 'rgba(57, 255, 20, ' + (0.3 * alpha) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, drawR * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      // Bubble dots
      for (var b = 0; b < 3; b++) {
        var bAngle = bubblePhase * (1 + b * 0.7) + b * 2.1;
        var bDist = drawR * (0.2 + 0.4 * ((Math.sin(bAngle * 0.8) + 1) * 0.5));
        var bx = cx + Math.cos(bAngle) * bDist;
        var by = cy + Math.sin(bAngle) * bDist;
        var bSize = 2 + Math.sin(bAngle * 1.5) * 1;
        ctx.fillStyle = 'rgba(150, 255, 100, ' + (0.5 * alpha) + ')';
        ctx.beginPath();
        ctx.arc(bx, by, bSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function addAcidDissolveEffect(x, y) {
    var screenY = y + PLAY_Y_OFFSET;

    // Green acid particle burst
    var count = 18 + Math.floor(Math.random() * 6);
    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
      var speed = 30 + Math.random() * 70;
      powerUpParticles.push({
        x: x,
        y: screenY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.3 + Math.random() * 0.2,
        color: ACID_COLORS[Math.floor(Math.random() * ACID_COLORS.length)],
        size: 2 + Math.random() * 2.5
      });
    }

    // Bright green flash
    fissionFlashes.push({
      x: x,
      y: screenY,
      radius: 4,
      maxRadius: 30,
      life: 1.0,
      decay: 4.0
    });

    // Rising "DISSOLVED!" text
    powerUpTexts.push({
      x: x,
      y: screenY - 10,
      text: 'DISSOLVED!',
      color: '#39ff14',
      life: 1.0,
      maxLife: 0.8,
      fontSize: 14
    });
  }

  // ═══════════════════════════════════════════════════════
  //  MAGNET  —  Active magnet entity in play area
  // ═══════════════════════════════════════════════════════

  /**
   * Draw the active magnet on the play area.
   * magnet: {x, y, timer}
   * Horseshoe magnet emoji at center with pulsing red/silver glow,
   * concentric dashed magnetic field arcs, fade in last 2s.
   */
  function drawMagnet(ctx, magnet) {
    if (!magnet) return;

    var now = performance.now();
    var cx = magnet.x;
    var cy = magnet.y + PLAY_Y_OFFSET;
    var timer = magnet.timer != null ? magnet.timer : 5;
    var pullR = 200;

    // Fade/flicker in the last 2 seconds
    var fadeAlpha = timer < 2 ? (timer / 2) : 1.0;
    var flicker = timer < 2 ? (0.6 + 0.4 * Math.sin(now * 0.04 * (3 - timer))) : 1.0;
    var alpha = fadeAlpha * flicker;

    var rot = now * 0.002; // slow field-line rotation
    var pulse = 0.85 + 0.15 * Math.sin(now * 0.005); // gentle pulse

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Concentric magnetic field lines (dashed arcs) ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    for (var ring = 1; ring <= 4; ring++) {
      var ringR = 30 + (pullR - 30) * (ring / 4);
      var ringAlpha = 0.08 + 0.05 * (4 - ring) / 4;
      // Draw partial arcs (magnetic field style — top and bottom)
      for (var arc = 0; arc < 6; arc++) {
        var arcStart = (Math.PI * 2 / 6) * arc + ring * 0.3;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(200, 40, 40, ' + ringAlpha + ')';
        ctx.arc(0, 0, ringR * pulse, arcStart, arcStart + Math.PI * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(180, 180, 200, ' + ringAlpha + ')';
        ctx.arc(0, 0, ringR * pulse, arcStart + Math.PI * 0.3, arcStart + Math.PI * 0.5);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();

    // ── Pulsing red/silver glow around magnet ──
    ctx.save();
    ctx.shadowColor = 'rgba(220, 40, 40, ' + (0.6 * pulse) + ')';
    ctx.shadowBlur = 22 * pulse;
    var glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35);
    glowGrad.addColorStop(0, 'rgba(220, 50, 50, ' + (0.25 * pulse) + ')');
    glowGrad.addColorStop(0.5, 'rgba(200, 180, 190, ' + (0.12 * pulse) + ')');
    glowGrad.addColorStop(1, 'rgba(180, 30, 30, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Spinning accent arcs close to center (metallic ring) ──
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rot * 1.8);
    ctx.strokeStyle = 'rgba(190, 190, 210, 0.35)';
    ctx.lineWidth = 2;
    for (var seg = 0; seg < 3; seg++) {
      var segStart = (Math.PI * 2 / 3) * seg;
      ctx.beginPath();
      ctx.arc(0, 0, 24, segStart, segStart + Math.PI * 0.45);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200, 40, 40, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.rotate(rot * 3.2);
    for (var seg2 = 0; seg2 < 4; seg2++) {
      var seg2Start = (Math.PI * 2 / 4) * seg2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, seg2Start, seg2Start + Math.PI * 0.3);
      ctx.stroke();
    }
    ctx.restore();

    // ── Magnet emoji at center ──
    ctx.save();
    ctx.shadowColor = '#cc3333';
    ctx.shadowBlur = 14 * pulse;
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83E\uDDF2', cx, cy);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.restore();
  }

  /**
   * Draw the active snake on the play area.
   * snake: {segments: [{x,y}, ...], timer, active}
   * Head is segments[0]. Body tapers toward the tail.
   * Uses quadratic curves for organic movement, fades in last 3s.
   */
  function drawSnake(ctx, snake) {
    if (!snake || !snake.active || !snake.segments || snake.segments.length < 2) return;

    var segs = snake.segments;
    var timer = snake.timer != null ? snake.timer : 12;

    // Fade/flicker in last 3 seconds
    var fadeAlpha = timer < 3 ? (timer / 3) : 1.0;
    var flicker = timer < 3 ? (0.7 + 0.3 * Math.sin(performance.now() * 0.03 * (4 - timer))) : 1.0;
    var alpha = fadeAlpha * flicker;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Green glow on entire snake
    ctx.shadowColor = '#22cc44';
    ctx.shadowBlur = 12;

    // Draw body curve — thick green line with quadratic curves
    ctx.beginPath();
    ctx.moveTo(segs[0].x, segs[0].y + PLAY_Y_OFFSET);
    for (var i = 1; i < segs.length; i++) {
      var prev = segs[i - 1];
      var cur = segs[i];
      var mx = (prev.x + cur.x) / 2;
      var my = (prev.y + cur.y) / 2 + PLAY_Y_OFFSET;
      ctx.quadraticCurveTo(prev.x, prev.y + PLAY_Y_OFFSET, mx, my);
    }
    var last = segs[segs.length - 1];
    ctx.lineTo(last.x, last.y + PLAY_Y_OFFSET);
    ctx.strokeStyle = '#22aa44';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw body segments as circles (tapering toward tail)
    for (var si = segs.length - 1; si >= 1; si--) {
      var seg = segs[si];
      var t = 1 - (si / segs.length);
      var segRadius = 3 + t * 2; // 5 near head, 3 at tail
      var grad = ctx.createRadialGradient(
        seg.x, seg.y + PLAY_Y_OFFSET, 0,
        seg.x, seg.y + PLAY_Y_OFFSET, segRadius
      );
      grad.addColorStop(0, '#44ee66');
      grad.addColorStop(0.7, '#22aa44');
      grad.addColorStop(1, '#118833');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(seg.x, seg.y + PLAY_Y_OFFSET, segRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw head — larger green circle with eyes
    var head = segs[0];
    var hx = head.x;
    var hy = head.y + PLAY_Y_OFFSET;
    var headRadius = 8;

    // Determine facing direction from head to next segment
    var next = segs[1];
    var dx = hx - next.x;
    var dy = hy - (next.y + PLAY_Y_OFFSET);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var dirX = dx / dist;
    var dirY = dy / dist;

    // Head gradient
    var headGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, headRadius);
    headGrad.addColorStop(0, '#66ff88');
    headGrad.addColorStop(0.6, '#33dd55');
    headGrad.addColorStop(1, '#118833');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(hx, hy, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Eyes — two small white dots with black pupils
    var perpX = -dirY;
    var perpY = dirX;
    var eyeOffset = 3;
    var eyeForward = 4;
    for (var ei = -1; ei <= 1; ei += 2) {
      var ex = hx + dirX * eyeForward + perpX * eyeOffset * ei;
      var ey = hy + dirY * eyeForward + perpY * eyeOffset * ei;
      // White of eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Black pupil
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(ex + dirX * 0.8, ey + dirY * 0.8, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Fire destroy effect — fire burst at a burned ball's position.
   * Orange → red → yellow particles with expanding flame ring.
   */
  function addFireDestroyEffect(x, y) {
    var screenY = y + PLAY_Y_OFFSET;

    // Fire burst particles
    var count = 28 + Math.floor(Math.random() * 8);
    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
      var speed = 50 + Math.random() * 110;
      powerUpParticles.push({
        x: x,
        y: screenY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.3 + Math.random() * 0.4,
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        size: 2.5 + Math.random() * 3.5
      });
    }

    // Expanding flame ring
    fissionFlashes.push({
      x: x,
      y: screenY,
      radius: 6,
      maxRadius: 45,
      life: 1.0,
      decay: 2.2
    });

    // Rising "BURN!" text
    powerUpTexts.push({
      x: x,
      y: screenY - 10,
      text: '\uD83D\uDD25 BURN!',
      color: '#ff4500',
      life: 1.0,
      maxLife: 0.9,
      fontSize: 15
    });
  }

  /**
   * Snake eat effect — "chomp" burst with green particles + rising "NOM!" text.
   */
  function addSnakeEatEffect(x, y) {
    var screenY = y + PLAY_Y_OFFSET;

    // Green particle burst (chomp)
    var count = 16 + Math.floor(Math.random() * 6);
    for (var i = 0; i < count; i++) {
      if (powerUpParticles.length >= MAX_PARTICLES) break;
      var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.6;
      var speed = 40 + Math.random() * 80;
      powerUpParticles.push({
        x: x,
        y: screenY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.25 + Math.random() * 0.2,
        color: SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Quick flash
    fissionFlashes.push({
      x: x,
      y: screenY,
      radius: 4,
      maxRadius: 25,
      life: 1.0,
      decay: 4.0
    });

    // Rising "NOM!" text
    powerUpTexts.push({
      x: x,
      y: screenY - 10,
      text: 'NOM!',
      color: '#33ff55',
      life: 1.0,
      maxLife: 0.8,
      fontSize: 14
    });
  }

  return {
    PLAY_WIDTH: PLAY_WIDTH,
    PLAY_HEIGHT: PLAY_HEIGHT,
    PLAY_Y_OFFSET: PLAY_Y_OFFSET,
    initCanvas: initCanvas,
    setFrameTime: setFrameTime,
    triggerShake: triggerShake,
    clearCanvas: clearCanvas,
    drawPlayArea: drawPlayArea,
    drawObstacles: drawObstacles,
    drawDangerOverlay: drawDangerOverlay,
    drawBalls: drawBalls,
    drawBoundaries: drawBoundaries,
    drawGrowingLines: drawGrowingLines,
    drawFilledRegions: drawFilledRegions,
    drawHUD: drawHUD,
    drawScore: drawScore,
    drawDirectionIndicator: drawDirectionIndicator,
    resetRegionFades: resetRegionFades,
    addFissionEffect: addFissionEffect,
    updateParticles: updateParticles,
    drawParticles: drawParticles,
    drawPowerUps: drawPowerUps,
    addPowerUpEffect: addPowerUpEffect,
    addBombExplosionAt: addBombExplosionAt,
    addNukeExplosion: addNukeExplosion,
    resolveMysteryText: resolveMysteryText,
    addMysteryRevealEffect: addMysteryRevealEffect,
    drawPowerUpEffects: drawPowerUpEffects,
    drawSlowOverlay: drawSlowOverlay,
    drawShieldOverlay: drawShieldOverlay,
    drawLightningOverlay: drawLightningOverlay,
    drawFreezeOverlay: drawFreezeOverlay,
    drawShrinkOverlay: drawShrinkOverlay,
    drawGrowOverlay: drawGrowOverlay,
    drawStickyOverlay: drawFusionOverlay,
    drawFusionOverlay: drawFusionOverlay,
    drawFissionOverlay: drawFissionOverlay,
    drawWaveOverlay: drawWaveOverlay,
    drawWebZones: drawWebZones,
    addMergeEffect: addMergeEffect,
    drawPortals: drawPortals,
    addTeleportEffect: addTeleportEffect,
    updateAndDrawTeleportParticles: updateAndDrawTeleportParticles,
    drawSinkhole: drawSinkhole,
    updateAndDrawSinkholeParticles: updateAndDrawSinkholeParticles,
    addSinkholeDestroyEffect: addSinkholeDestroyEffect,
    drawMagnet: drawMagnet,
    drawSnake: drawSnake,
    addSnakeEatEffect: addSnakeEatEffect,
    drawAcidPools: drawAcidPools,
    addAcidDissolveEffect: addAcidDissolveEffect,
    addFireDestroyEffect: addFireDestroyEffect,
    launchFireworks: launchFireworks,
    updateFireworks: updateFireworks,
    drawFireworks: drawFireworks,
    isFireworksActive: isFireworksActive,
    setTheme: setTheme,
    getThemeName: getThemeName,
    setShapeVertices: setShapeVertices,
    THEMES: THEMES
  };
})();
