/**
 * @module fp.push
 */
(function (module) {
  'use strict';

  /**
   * Some push default settings.
   * @constant
   * @type {object}
   */
  var PUSH_DEFAULT_SETTINGS = {
    android: {
      senderID: null,
      clearBadge: true
    },
    ios: {
      alert: true,
      badge: true,
      sound: true,
      clearBadge: true
    }
  };

  /**
   * Push error messages.
   * @constant
   * @type {object}
   */
  var PUSH_ERRORS = {
    MISSING_GLOBALS: 'missing the phonegap-plugin-push, ionic or lodash',
    // Same error that $cordovaPushV5 throws.
    NOT_INITIALIZED: 'init must be called before any other operation'
  };

  /**
   * Push event names.
   * @constant
   * @type {object}
   */
  var PUSH_EVENTS = {
    ON_NOTIFICATION: '$cordovaPushV5:notificationReceived',
    ON_ERROR: '$cordovaPushV5:errorOccurred'
  };

  module.constant('PUSH_DEFAULT_SETTINGS', PUSH_DEFAULT_SETTINGS);
  module.constant('PUSH_ERRORS', PUSH_ERRORS);
  module.constant('PUSH_EVENTS', PUSH_EVENTS);

}(angular.module('fp.push', ['fp.utils'])));
