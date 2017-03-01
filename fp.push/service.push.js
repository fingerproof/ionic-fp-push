/**
 * @memberOf fp.push
 */
(function (module) {
  'use strict';

  /**
   * The push notifications service.
   * @constructor
   * @param {Object} $q - The Angular $q service.
   * @param {Object} $window - The Angular $window service.
   * @param {Object} $rootScope - The Angular $rootScope service.
   * @param {Object} $cordovaPushV5 - The Ionic $cordovaPushV5 service.
   * @param {Object} cacheUtils - Some caching utilities.
   * @param {Object} cordovaUtils - Some Cordova utilities.
   * @param {Object} PUSH_DEFAULT_SETTINGS - Some push default settings.
   * @param {Object} PUSH_ERRORS - Push error messages.
   * @param {Object} PUSH_EVENTS - Push event names.
   */
  function PushService(
    $q,
    $window,
    $rootScope,
    $cordovaPushV5,
    cacheUtils,
    cordovaUtils,
    PUSH_DEFAULT_SETTINGS,
    PUSH_ERRORS,
    PUSH_EVENTS
  ) {
    var service = this;

    var PushNotification = $window.PushNotification;
    var ionic = $window.ionic;
    var _ = $window._;

    if (!PushNotification || !ionic || !_) {
      throw new Error(PUSH_ERRORS.MISSING_GLOBALS);
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
     * setting `$event` as the handler second parameter.
     * @private
     * @function
     * @param {String} event - An event name.
     * @param {Function} handler - An event handler.
     * @return {Function} Deregistration function.
     */
    function listenTo(event, handler) {
      return $rootScope.$on(event, _.rearg(handler, 1, 0));
    }

    /**
     * Get or create a cache.
     * @private
     * @function
     * @return {Object}
     */
    function getCache() { return cacheUtils.getModuleCache(module); }

    /**
     * Check whether or not the device is registered, rejecting with an error.
     * @private
     * @function
     * @param {Function} reject - A promise reject function.
     * @return {Boolean}
     */
    function checkRegistration(reject) {
      if (service.isRegistered()) { return true; }
      reject(new Error(PUSH_ERRORS.NOT_INITIALIZED));
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
     * @param {Function} handler - Passing $event and the notification.
     * @return {Function} Deregistration function for the listener.
     */
    service.onNotification = _.partial(listenTo, PUSH_EVENTS.ON_NOTIFICATION);

    /**
     * Attach an event handler that will be called on every error.
     * @param {Function} handler - Passing $event and the error.
     * @return {Function} Deregistration function for the listener.
     */
    service.onError = _.partial(listenTo, PUSH_EVENTS.ON_ERROR);

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
    service.isRegistered = function () {
      return !!(plugin && service.getDeviceToken());
    };

    /**
     * Check whether or not the user allowed the app to get notifications.
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
     * Register the device to receive push notifications, get the device token.
     * @param {Object} [options=PUSH_DEFAULT_SETTINGS] - Push plugin settings.
     * @param {String} options.android.senderID - Mandatory on Android.
     * @return {Promise} Passing `{ current, previous, hasChanged }`.
     */
    service.register = cordovaUtils.whenReady(function (options) {
      return service.unregister().then(function () {
        var settings = _.merge({}, PUSH_DEFAULT_SETTINGS, options);
        return $cordovaPushV5.initialize(settings);
      }).then(function (instance) {
        plugin = instance;
        $cordovaPushV5.onError();
        $cordovaPushV5.onNotification();
        return $q(function (resolve, reject) {
          plugin.on('error', reject);
          function off() { plugin.off('error', reject); }
          $cordovaPushV5.register().then(resolve).catch(reject).finally(off);
        });
      }).then(function (token) {
        var old = service.getDeviceToken();
        getCache().put(DEVICE_TOKEN_CACHE_KEY, token);
        return { current: token, previous: old, hasChanged: token !== old };
      }).catch(function (error) {
        function restore() { return $q.reject(error); }
        return service.unregister().then(restore);
      });
    });

    /**
     * Unregister the device so that it won't receive push notifications.
     * @return {Promise} Passing the device token if any.
     */
    service.unregister = cordovaUtils.whenReady(function () {
      if (!service.isRegistered()) { return $q.when(); }
      return $cordovaPushV5.unregister().then(function () {
        plugin = null;
        return getCache().remove(DEVICE_TOKEN_CACHE_KEY);
      });
    });

    /**
     * Subscribe to a new notifications topic.
     * @param {String} topic - The topic to subscribe to.
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
     * @param {String} topic - The topic to unsubscribe from.
     * @return {Promise}
     */
    service.unsubscribe = cordovaUtils.whenReady(function (topic) {
      return $q(function (resolve, reject) {
        if (!checkRegistration(reject)) { return; }
        plugin.unsubscribe(topic, resolve, reject);
      });
    });

    /**
     * Get current application icon badge value.
     * @return {Promise} Passing the number or `-1` if not supported.
     */
    service.getBadgeNumber = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkPlatform('ios', resolve, -1)) { return; }
        $cordovaPushV5.getBadgeNumber().then(resolve).catch(reject);
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
        return $cordovaPushV5.setBadgeNumber(number).then(ok).catch(reject);
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
        $cordovaPushV5.finish().then(resolve).catch(reject);
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
