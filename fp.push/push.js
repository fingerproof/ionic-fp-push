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
      forceShow: true
    },
    ios: {
      alert: true,
      badge: true,
      sound: true,
      clearBadge: true
    }
  };

  module.constant('PUSH_DEFAULT_SETTINGS', PUSH_DEFAULT_SETTINGS);

}(angular.module('fp.push', ['fp.utils'])));
