/**
 * @memberOf fp.push
 */
(function (module) {
  'use strict';

  /**
   * The push notifications service.
   * @constructor
   * @param {object} $q - The Angular $q service.
   * @param {object} $log - The Angular $log service.
   * @param {object} $window - The Angular $window service.
   * @param {object} $rootScope - The Angular $rootScope service.
   * @param {object} $pushV5 - The ngCordova $cordovaPushV5 service.
   * @param {object} cacheUtils - Some caching utilities.
   * @param {object} cordovaUtils - Some Cordova utilities.
   * @param {object} DEFAULT_SETTINGS - Push default settings.
   * @param {object} ERRORS - Push error messages.
   * @param {object} EVENTS - Push event names.
   */
  function PushService(
    $q,
    $log,
    $window,
    $rootScope,
    $pushV5,
    cacheUtils,
    cordovaUtils,
    DEFAULT_SETTINGS,
    ERRORS,
    EVENTS
  ) {
    var service = this;

    var PushNotification = $window.PushNotification;
    var _ = $window._;

    if (cordovaUtils.isCordova() && !PushNotification) {
      return $log.error(ERRORS.MISSING_GLOBALS);
    }

    /**
     * Device token cache key.
     * @private
     * @constant
     * @type {string}
     */
    var DEVICE_TOKEN_CACHE_KEY = 'deviceToken';

    /**
     * Push plugin instance.
     * @private
     * @type {PushNotification}
     */
    var plugin = null;

    /**
     * Attach an event listener to the root scope
     * passing `$event` as the handler second parameter.
     * @private
     * @function
     * @param {string} event - Event name.
     * @param {Function} handler - Event handler.
     * @return {Function} Deregistration function.
     */
    function listenTo(event, handler) {
      return $rootScope.$on(event, _.rearg(handler, 1, 0));
    }

    /**
     * Get or create the module cache.
     * @private
     * @function
     * @return {object}
     */
    function getCache() { return cacheUtils.getModuleCache(module); }

    /**
     * Check whether or not the device is registered, rejecting if not.
     * @private
     * @function
     * @param {Function} reject - A promise reject function.
     * @return {boolean}
     */
    function checkRegistration(reject) {
      if (service.isRegistered()) { return true; }
      reject(new Error(ERRORS.NOT_INITIALIZED));
      return false;
    }

    /**
     * Attach an event handler that will be called on every notification.
     * @param {Function} handler - Passing the notification and $event.
     * @return {Function} Deregistration function for the listener.
     */
    service.onNotification = _.partial(listenTo, EVENTS.ON_NOTIFICATION);

    /**
     * Attach an event handler that will be called on every error.
     * @param {Function} handler - Passing the error and $event.
     * @return {Function} Deregistration function for the listener.
     */
    service.onError = _.partial(listenTo, EVENTS.ON_ERROR);

    /**
     * Get the cached device token, if any.
     * @return {string|undefined}
     */
    service.getDeviceToken = function () {
      return getCache().get(DEVICE_TOKEN_CACHE_KEY);
    };

    /**
     * Check whether or not the device is registered.
     * @return {boolean}
     */
    service.isRegistered = function () { return !!plugin; };

    /**
     * Check whether or not the user allowed the app to receive notifications.
     * @return {Promise} Passing `true` if allowed, `false` if not.
     */
    service.checkPermission = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        var ok = function (push) { resolve(push.isEnabled); };
        PushNotification.hasPermission(ok, reject);
      });
    });

    /**
     * Register the device to receive notifications, get the device token.
     * @param {object} [options=DEFAULT_SETTINGS] - Push plugin settings.
     * @return {Promise} Passing `{ current, previous, hasChanged }`.
     */
    service.register = cordovaUtils.whenReady(function (options) {
      var old = undefined;
      return service.unregister().then(function (token) {
        if (token) { old = token; }
        return $pushV5.initialize(_.merge({}, DEFAULT_SETTINGS, options));
      }).then(function (instance) {
        plugin = instance;
        $pushV5.onError();
        $pushV5.onNotification();
        return $q(function (resolve, reject) {
          plugin.on('error', reject);
          function off() { plugin.off('error', reject); }
          $pushV5.register().then(resolve).catch(reject).finally(off);
        });
      }).then(function (token) {
        getCache().put(DEVICE_TOKEN_CACHE_KEY, token);
        return { current: token, previous: old, hasChanged: token !== old };
      }).catch(function (error) {
        function restore() { return $q.reject(error); }
        return service.unregister().then(restore);
      });
    });

    /**
     * Unregister the device so that it won't receive notifications anymore.
     * @return {Promise} Passing the device token, if any.
     */
    service.unregister = cordovaUtils.whenReady(function () {
      var promise = service.isRegistered() ? $pushV5.unregister() : $q.when();
      return promise.then(function () {
        plugin = null;
        return getCache().remove(DEVICE_TOKEN_CACHE_KEY);
      });
    });

    /**
     * Create a notifications channel (Android O+).
     * @param {object} channel - Channel description object.
     * @return {Promise} Passing `null` if not supported.
     */
    service.createChannel = cordovaUtils.ifPlatformWhenReady(
      'android',
      function (channel) {
        return $q(function (resolve, reject) {
          PushNotification.createChannel(resolve, reject, channel);
        });
      },
      null
    );

    /**
     * Delete an existing notifications channel (Android O+).
     * @param {string} id - Channel id.
     * @return {Promise}
     */
    service.deleteChannel = cordovaUtils.ifPlatformWhenReady(
      'android',
      function (id) {
        return $q(function (resolve, reject) {
          PushNotification.deleteChannel(resolve, reject, id);
        });
      }
    );

    /**
     * List existing notifications channels (Android O+).
     * @return {Promise} Passing `null` if not supported.
     */
    service.listChannels = cordovaUtils.ifPlatformWhenReady(
      'android',
      function () {
        return $q(function (resolve, reject) {
          PushNotification.listChannels(resolve, reject);
        });
      },
      null
    );

    /**
     * Subscribe to a new notifications topic.
     * @param {string} topic - The topic name to subscribe to.
     * @return {Promise}
     */
    service.subscribe = cordovaUtils.whenReady(function (topic) {
      return $q(function (resolve, reject) {
        if (!checkRegistration(reject)) { return; }
        plugin.subscribe(topic, resolve, reject);
      });
    });

    /**
     * Unsubscribe from a given notifications topic.
     * @param {string} topic - The topic name to unsubscribe from.
     * @return {Promise}
     */
    service.unsubscribe = cordovaUtils.whenReady(function (topic) {
      return $q(function (resolve, reject) {
        if (!checkRegistration(reject)) { return; }
        plugin.unsubscribe(topic, resolve, reject);
      });
    });

    /**
     * Get the current application icon badge value.
     * @return {Promise} Passing the number or `-1` if not supported.
     */
    service.getBadgeNumber = cordovaUtils.ifPlatformWhenReady(
      ['ios', 'android'],
      function () { return $pushV5.getBadgeNumber(); },
      -1
    );

    /**
     * Set the application icon badge value.
     * @param {number} [number=0]
     * @return {Promise} Passing the number or `-1` if not supported.
     */
    service.setBadgeNumber = cordovaUtils.ifPlatformWhenReady(
      ['ios', 'android'],
      function (number) {
        if (!arguments.length) { number = 0; }
        var ok = function () { return number; };
        return $pushV5.setBadgeNumber(number).then(ok);
      },
      -1
    );

    /**
     * Increment the current application icon badge value.
     * @param {number} [number=1]
     * @return {Promise} Passing the number.
     */
    service.incrementBadgeNumber = function (number) {
      if (!arguments.length) { number = 1; }
      function ok(value) { return service.setBadgeNumber(value + number); }
      return service.getBadgeNumber().then(ok);
    };

    /**
     * Tell the OS when a background push notification has been handled.
     * @param {string} [process] - Bakcground process id.
     * @return {Promise}
     */
    service.notificationHandled = cordovaUtils.ifPlatformWhenReady(
      'ios',
      function (process) {
        return $q(function (resolve, reject) {
          if (!checkRegistration(reject)) { return; }
          plugin.finish(resolve, reject, process);
        });
      }
    );

    /**
     * Clear all notifications from the notification center.
     * @return {Promise}
     */
    service.clearNotifications = cordovaUtils.ifPlatformWhenReady(
      ['ios', 'android'],
      function () {
        return $q(function (resolve, reject) {
          if (!checkRegistration(reject)) { return; }
          plugin.clearAllNotifications(resolve, reject);
        });
      }
    );

    /**
     * Clear a given notification from the notification center.
     * @param {number} id - Notification id.
     * @return {Promise}
     */
    service.clearNotification = cordovaUtils.ifPlatformWhenReady(
      ['ios', 'android'],
      function (id) {
        return $q(function (resolve, reject) {
          if (!checkRegistration(reject)) { return; }
          plugin.clearNotification(resolve, reject, id);
        });
      }
    );
  }

  module.service('pushService', [
    '$q',
    '$log',
    '$window',
    '$rootScope',
    '$cordovaPushV5',
    'cacheUtils',
    'cordovaUtils',
    'PUSH_DEFAULT_SETTINGS',
    'PUSH_ERRORS',
    'PUSH_EVENTS',
    PushService
  ]);

}(angular.module('fp.push')));
