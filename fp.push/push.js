/**
 * @module fp.push
 */
(function (module) {
  'use strict';

  /**
   * Some push default settings.
   * @constant PUSH_DEFAULT_SETTINGS
   * @type {Object}
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
   * @constant PUSH_ERRORS
   * @type {Object}
   */
  var PUSH_ERRORS = {
    MISSING_GLOBALS: 'missing the phonegap-plugin-push, ionic or lodash',
    // Same error as $cordovaPushV5 throws.
    NOT_INITIALIZED: 'init must be called before any other operation'
  };

  module.constant('PUSH_DEFAULT_SETTINGS', PUSH_DEFAULT_SETTINGS);
  module.constant('PUSH_ERRORS', PUSH_ERRORS);

}(angular.module('fp.push', ['fp.utils'])));
