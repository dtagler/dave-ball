/**
 * input.js — Mouse input handler for Dave Ball game
 * Tracks mouse position, dispatches line-start events, toggles direction.
 * Uses global namespace pattern (no bundler required).
 */
var DaveBall = DaveBall || {};

DaveBall.Input = (function () {
  'use strict';

  var mousePos = { x: 0, y: 0 };
  var direction = 'vertical'; // 'vertical' or 'horizontal'
  var canvas = null;

  /**
   * Convert mouse event to canvas-relative coordinates.
   */
  function toCanvasCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * Check whether a point is inside the play area (below HUD).
   */
  function isInPlayArea(pos) {
    var R = DaveBall.Renderer;
    return (
      pos.x >= 0 &&
      pos.x <= R.PLAY_WIDTH &&
      pos.y >= R.PLAY_Y_OFFSET &&
      pos.y <= R.PLAY_Y_OFFSET + R.PLAY_HEIGHT
    );
  }

  /**
   * Initialize input handlers on the given canvas element.
   * @param {HTMLCanvasElement} canvasEl
   */
  function initInput(canvasEl) {
    canvas = canvasEl;

    // Track mouse position
    canvas.addEventListener('mousemove', function (e) {
      mousePos = toCanvasCoords(e);
    });

    // Left-click → dispatch 'line-start' custom event
    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return; // only left button
      e.preventDefault();
      var pos = toCanvasCoords(e);

      if (!isInPlayArea(pos)) return;

      // Convert to play-area-local coordinates (origin at top-left of play area)
      var playX = pos.x;
      var playY = pos.y - DaveBall.Renderer.PLAY_Y_OFFSET;

      var event = new CustomEvent('line-start', {
        detail: {
          x: playX,
          y: playY,
          direction: direction
        }
      });
      canvas.dispatchEvent(event);
    });

    // Right-click → toggle direction
    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      direction = direction === 'vertical' ? 'horizontal' : 'vertical';
    });

    // Visual feedback: change cursor based on play area
    canvas.addEventListener('mousemove', function () {
      if (isInPlayArea(mousePos)) {
        canvas.style.cursor = 'crosshair';
      } else {
        canvas.style.cursor = 'default';
      }
    });

    // Reset cursor when mouse leaves
    canvas.addEventListener('mouseleave', function () {
      mousePos = { x: -1, y: -1 };
      canvas.style.cursor = 'default';
    });
  }

  /**
   * Get current mouse position in canvas coordinates.
   * @returns {{ x: number, y: number }}
   */
  function getMousePos() {
    return { x: mousePos.x, y: mousePos.y };
  }

  /**
   * Get current direction mode.
   * @returns {string} 'vertical' or 'horizontal'
   */
  function getDirection() {
    return direction;
  }

  /**
   * Toggle direction between vertical and horizontal.
   */
  function toggleDirection() {
    direction = direction === 'vertical' ? 'horizontal' : 'vertical';
  }

  // Public API
  return {
    initInput: initInput,
    getMousePos: getMousePos,
    getDirection: getDirection,
    toggleDirection: toggleDirection
  };
})();
