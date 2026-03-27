/**
 * interpolation.js — Position smoothing between server state updates
 * Provides linear interpolation for ball positions so 30Hz server ticks
 * look smooth at 60fps on the client.
 * Uses global namespace pattern (no bundler required).
 */
var DaveBall = DaveBall || {};

DaveBall.Interpolation = (function () {
  'use strict';

  /**
   * Linear interpolation between two values.
   * @param {number} a - Start value
   * @param {number} b - End value
   * @param {number} t - Interpolation factor (0 = a, 1 = b)
   * @returns {number}
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Interpolate ball positions between two server states.
   * Returns a new array of ball objects with smoothed x/y.
   *
   * @param {Array} previousState - Ball array from the prior server tick
   * @param {Array} currentState  - Ball array from the latest server tick
   * @param {number} t            - Progress between states (0..1)
   * @returns {Array} Interpolated ball objects
   */
  function interpolateBalls(previousState, currentState, t) {
    if (!previousState || !previousState.length) {
      return currentState || [];
    }
    if (!currentState || !currentState.length) {
      return previousState;
    }

    // Clamp t to [0, 1]
    t = Math.max(0, Math.min(1, t));

    var result = [];
    var len = Math.min(previousState.length, currentState.length);

    for (var i = 0; i < len; i++) {
      var prev = previousState[i];
      var curr = currentState[i];
      result.push({
        x: lerp(prev.x, curr.x, t),
        y: lerp(prev.y, curr.y, t),
        radius: curr.radius || prev.radius,
        color: curr.color || prev.color
      });
    }

    // If current state has more balls than previous (new ball spawned), include them directly
    for (var j = len; j < currentState.length; j++) {
      result.push(currentState[j]);
    }

    return result;
  }

  // Public API
  return {
    lerp: lerp,
    interpolateBalls: interpolateBalls
  };
})();
