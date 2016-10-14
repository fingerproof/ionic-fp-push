/**
 * @memberOf fp.push
 */
(function (module) {
  'use strict';

  /**
   * The push notifications service.
   * @constructor PushService
   * @param {Object} $q - The Angular $q service.
   * @param {Object} $window - The Angular $window service.
   * @param {Object} $cordovaPushV5 - The Ionic $cordovaPushV5 service.
   * @param {Object} cacheUtils - Some caching utilities.
   * @param {Object} cordovaUtils - Some Cordova utilities.
   * @param {Object} PUSH_DEFAULT_SETTINGS - Some push default settings.
   * @param {Object} PUSH_ERRORS - Push error messages.
   */
  function PushService(
    $q,
    $window,
    $cordovaPushV5,
    cacheUtils,
    cordovaUtils,
    PUSH_DEFAULT_SETTINGS,
    PUSH_ERRORS
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
     * Get or create a cache.
     * @private
     * @function getCache
     * @return {Object}
     */
    function getCache() { return cacheUtils.getModuleCache(module); }

    /**
     * Check whether or not the device is registered, rejecting with an error.
     * @private
     * @function checkRegistration
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
     * @function checkPlatform
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
     * @function checkPlatforms
     * @param {Array} names - The platform names.
     * @param {Function} resolve - A promise resolve function.
     * @param {*} [fallback] - A fallback value to resolve with.
     * @return {Boolean}
     */
    function checkPlatforms(names, resolve, fallback) {
      return _.some(names, _.partial(checkPlatform, _, resolve, fallback));
    }

    /**
     * Get the cached device token, if any.
     * @method getDeviceToken
     * @return {String|undefined}
     */
    service.getDeviceToken = function () {
      return getCache().get(DEVICE_TOKEN_CACHE_KEY);
    };

    /**
     * Check whether or not the device is registered.
     * @method isRegistered
     * @return {Boolean}
     */
    service.isRegistered = function () {
      return !!(plugin && service.getDeviceToken());
    };

    /**
     * Check whether or not the user allowed the app to get notifications.
     * @method checkPermission
     * @return {Promise} Passing `true` if allowed, `false` if not, or `null`.
     */
    service.checkPermission = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkPlatforms(['ios', 'android'], resolve, null)) { return; }
        var success = function (data) { resolve(data.isEnabled); }
        PushNotification.hasPermission(success, reject);
      });
    });

    /**
     * Register the device to receive push notifications, get the device token.
     * @method register
     * @param {Object} [options=PUSH_DEFAULT_SETTINGS] - Push plugin settings.
     * @param {String} options.android.senderID - Mandatory on Android.
     * @return {Promise} Passing `{ value: String, hasChanged: Boolean }`.
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
      }).then(function (deviceToken) {
        var stored = service.getDeviceToken();
        getCache().put(DEVICE_TOKEN_CACHE_KEY, token);
        return { value: deviceToken, hasChanged: deviceToken !== stored };
      }).catch(function (error) {
        function restore() { return $q.reject(error); }
        return service.unregister().then(restore);
      });
    });

    /**
     * Unregister the device so that it won't receive push notifications.
     * @method unregister
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
     * @method subscribe
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
     * @method unsubscribe
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
     * @method getBadgeNumber
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
     * @method setBadgeNumber
     * @param {Number} [number=0]
     * @return {Promise} Passing the number or `-1` if not supported.
     */
    service.setBadgeNumber = cordovaUtils.whenReady(function (number) {
      if (!arguments.length) { number = 0; }
      return $q(function (resolve, reject) {
        if (!checkPlatforms(['ios', 'android'], resolve, -1)) { return; }
        var success = function () { resolve(number); };
        return $cordovaPushV5.setBadgeNumber(number).then(success);
      });
    });

    /**
     * Increment the current application icon badge value.
     * @method incrementBadgeNumber
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
     * @method notificationHandled
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
     * @method clearNotifications
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
    '$window'
    '$cordovaPushV5',
    'cacheUtils',
    'cordovaUtils',
    'PUSH_DEFAULT_SETTINGS',
    'PUSH_ERRORS',
    PushService
  ]);

}(angular.module('fp.push')));
