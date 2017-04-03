/**
 * @memberOf fp.push
 */
(function (module) {
  'use strict';

  /**
   * The push notifications service.
   * @constructor
   * @param {Object} $q - The Angular $q service.
   * @param {Object} $log - The Angular $log service.
   * @param {Object} $window - The Angular $window service.
   * @param {Object} $rootScope - The Angular $rootScope service.
   * @param {Object} $pushV5 - The ngCordova $cordovaPushV5 service.
   * @param {Object} cacheUtils - Some caching utilities.
   * @param {Object} cordovaUtils - Some Cordova utilities.
   * @param {Object} DEFAULT_SETTINGS - Push default settings.
   * @param {Object} ERRORS - Push error messages.
   * @param {Object} EVENTS - Push event names.
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
    var ionic = $window.ionic;
    var _ = $window._;

    if (cordovaUtils.isCordova() && !PushNotification || !ionic || !_) {
      return $log.error(ERRORS.MISSING_GLOBALS);
    }

    /**
     * Device token cache key.
     * @private
     * @constant
     * @type {String}
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
     * @param {String} event - Event name.
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
     * @return {Object}
     */
    function getCache() { return cacheUtils.getModuleCache(module); }

    /**
     * Check whether or not the device is registered, rejecting if not.
     * @private
     * @function
     * @param {Function} reject - A promise reject function.
     * @return {Boolean}
     */
    function checkRegistration(reject) {
      if (service.isRegistered()) { return true; }
      reject(new Error(ERRORS.NOT_INITIALIZED));
      return false;
    }

    /**
     * Check if the device is running a given platform, using a fallback value.
     * @private
     * @function
     * @param {String} name - The platform name.
     * @param {Function} resolve - A promise resolve function.
     * @param {*} [fallback] - A fallback value to resolve with.
     * @return {Boolean}
     */
    function checkPlatform(name, resolve, fallback) {
      if (ionic.Platform.is(name)) { return true; }
      if (_.isUndefined(fallback)) { resolve(); }
      else { resolve(fallback); }
      return false;
    }

    /**
     * Same as `checkPlatform` but must match one of the given platforms.
     * @private
     * @function
     * @param {Array} names - The platform names.
     * @param {Function} resolve - A promise resolve function.
     * @param {*} [fallback] - A fallback value to resolve with.
     * @return {Boolean}
     */
    function checkPlatforms(names, resolve, fallback) {
      return _.some(names, _.partial(checkPlatform, _, resolve, fallback));
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
     * @return {String|undefined}
     */
    service.getDeviceToken = function () {
      return getCache().get(DEVICE_TOKEN_CACHE_KEY);
    };

    /**
     * Check whether or not the device is registered.
     * @return {Boolean}
     */
    service.isRegistered = function () { return !!plugin; };

    /**
     * Check whether or not the user allowed the app to receive notifications.
     * @return {Promise} Passing `true` if allowed, `false` if not, or `null`.
     */
    service.checkPermission = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkPlatforms(['ios', 'android'], resolve, null)) { return; }
        var ok = function (push) { resolve(push.isEnabled); };
        PushNotification.hasPermission(ok, reject);
      });
    });

    /**
     * Register the device to receive notifications, get the device token.
     * @param {Object} [options=DEFAULT_SETTINGS] - Push plugin settings.
     * @param {String} options.android.senderID - Mandatory on Android.
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
     * Subscribe to a new notifications topic.
     * @param {String} topic - The topic name to subscribe to.
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
     * @param {String} topic - The topic name to unsubscribe from.
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
    service.getBadgeNumber = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkPlatform('ios', resolve, -1)) { return; }
        $pushV5.getBadgeNumber().then(resolve).catch(reject);
      });
    });

    /**
     * Set the application icon badge value.
     * @param {Number} [number=0]
     * @return {Promise} Passing the number or `-1` if not supported.
     */
    service.setBadgeNumber = cordovaUtils.whenReady(function (number) {
      if (!arguments.length) { number = 0; }
      return $q(function (resolve, reject) {
        if (!checkPlatforms(['ios', 'android'], resolve, -1)) { return; }
        var ok = function () { resolve(number); };
        return $pushV5.setBadgeNumber(number).then(ok).catch(reject);
      });
    });

    /**
     * Increment the current application icon badge value.
     * @param {Number} [number=1]
     * @return {Promise} Passing the number.
     */
    service.incrementBadgeNumber = cordovaUtils.whenReady(function (number) {
      if (!arguments.length) { number = 1; }
      return service.getBadgeNumber().then(function (current) {
        return service.setBadgeNumber(current + number);
      });
    });

    /**
     * Tell the OS when a background push notification has been handled.
     * @return {Promise}
     */
    service.notificationHandled = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkPlatform('ios', resolve)) { return; }
        $pushV5.finish().then(resolve).catch(reject);
      });
    });

    /**
     * Clear all notifications from the notification center.
     * @return {Promise}
     */
    service.clearNotifications = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        var ok = checkRegistration(reject)
          && checkPlatforms(['ios', 'android'], resolve);
        if (ok) { plugin.clearAllNotifications(resolve, reject); }
      });
    });
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
