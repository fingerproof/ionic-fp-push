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
   */
  function PushService(
    $q,
    $window,
    $cordovaPushV5,
    cacheUtils,
    cordovaUtils,
    PUSH_DEFAULT_SETTINGS
  ) {
    var service = this;

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
      reject(new Error('You must register first'));
      return false;
    }

    /**
     * Check whether or not the device is running iOS, resolving with a value.
     * @private
     * @function checkIOS
     * @param {Function} resolve - A promise resolve function.
     * @param {*} [value] - A value to resolve with.
     * @return {Boolean}
     */
    function checkIOS(resolve, value) {
      if ($window.ionic.Platform.isIOS()) { return true; }
      if (_.isUndefined(value)) { resolve(); }
      else { resolve(value); }
      return false;
    }

    /**
     * Check whether or not the device is registered and running iOS.
     * @private
     * @function checkMethodAvailability
     * @param {Function} reject - A promise reject function.
     * @param {Function} resolve - A promise resolve function.
     * @param {*} [value] - A value to resolve with.
     * @return {Boolean}
     */
    function checkMethodAvailability(reject, resolve, value) {
      return checkRegistration(reject) && checkIOS(resolve, value);
    }

    /**
     * Get the cached device token, if any.
     * @method getDeviceToken
     * @return {String|undefined}
     */
    service.getDeviceToken = function () {
      return getCache().get('deviceToken');
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
     * Check whether or not the user allowed the app to handle notifications.
     * @method checkPermission
     * @return {Promise} Passing `true` if allowed or `false` if not.
     */
    service.checkPermission = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        function success(data) { resolve(data.isEnabled); }
        $window.PushNotification.hasPermission(success, reject);
      });
    });

    /**
     * Register the device to receive push notifications, get the device token.
     * @method register
     * @param {Object} [options=PUSH_DEFAULT_SETTINGS] - Push plugin settings.
     * @return {Promise} Passing the device token.
     */
    service.register = cordovaUtils.whenReady(function (options) {
      return service.unregister().then(function () {
        var settings = _.merge({}, PUSH_DEFAULT_SETTINGS, options);
        return $cordovaPushV5.initialize(settings);
      }).then(function (pushPlugin) {
        plugin = pushPlugin;
        var deferred = $q.defer();
        plugin.on('error', deferred.reject);
        $cordovaPushV5.register().then(deferred.resolve);
        function cleanup() { plugin.off('error', deferred.reject); }
        return deferred.promise.finally(cleanup);
      }).then(function (token) {
        getCache().put('deviceToken', token);
        $cordovaPushV5.onNotification();
        $cordovaPushV5.onError();
        return token;
      });
    });

    /**
     * Unregister the device so that it won't receive push notifications.
     * @method unregister
     * @return {Promise} Passing the device token.
     */
    service.unregister = cordovaUtils.whenReady(function () {
      if (!service.isRegistered()) { return $q.when(); }
      return $cordovaPushV5.unregister().then(function () {
        plugin = null;
        return getCache().remove('deviceToken');
      });
    });

    /**
     * Get current application icon badge value.
     * @method getBadgeNumber
     * @return {Promise} Passing the number.
     */
    service.getBadgeNumber = cordovaUtils.whenReady(function () {
      return $q(function (resolve, reject) {
        if (!checkMethodAvailability(reject, resolve, 0)) { return; }
        plugin.getApplicationIconBadgeNumber(resolve, reject);
      });
    });

    /**
     * Set the application icon badge value.
     * @method setBadgeNumber
     * @param {Number} [number=0]
     * @return {Promise} Passing the number.
     */
    service.setBadgeNumber = cordovaUtils.whenReady(function (number) {
      if (!arguments.length) { number = 0; }
      return $q(function (resolve, reject) {
        if (!checkMethodAvailability(reject, resolve, 0)) { return; }
        var success = function () { resolve(number); };
        plugin.setApplicationIconBadgeNumber(success, reject, number);
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
        if (!checkMethodAvailability(reject, resolve)) { return; }
        plugin.finish(resolve, reject);
      });
    });
  }

  module.service('pushService', [
    '$q',
    '$window',
    '$cordovaPushV5',
    'cacheUtils',
    'cordovaUtils',
    'PUSH_DEFAULT_SETTINGS',
    PushService
  ]);

}(angular.module('fp.push')));
