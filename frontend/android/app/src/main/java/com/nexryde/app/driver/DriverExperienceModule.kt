package com.nexryde.app.driver

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

class DriverExperienceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    DriverExperienceEvents.bind(reactContext)
  }

  override fun getName(): String = "DriverExperienceModule"

  @ReactMethod
  fun startDriverService(driverId: String?, token: String?, backendUrl: String?) {
    DriverForegroundService.start(reactContext, driverId, token, backendUrl)
  }

  @ReactMethod
  fun updateDriverSession(token: String?, backendUrl: String?) {
    DriverForegroundService.updateSession(reactContext, token, backendUrl)
  }

  @ReactMethod
  fun stopDriverService() {
    DriverForegroundService.stop(reactContext)
  }

  @ReactMethod
  fun showRideAlert(payload: ReadableMap) {
    val offer = readableMapToStrings(payload)
    DriverForegroundService.showRideAlert(reactContext, offer)
  }

  @ReactMethod
  fun stopRideAlert() {
    DriverForegroundService.stopRideAlert(reactContext)
  }

  @ReactMethod
  fun showBubble(status: String?, badge: Int) {
    DriverOverlayBubbleController.show(reactContext, status ?: "online", badge)
  }

  @ReactMethod
  fun updateBubble(status: String?, badge: Int, payload: ReadableMap?) {
    DriverOverlayBubbleController.update(status ?: "online", badge, payload?.let { readableMapToStrings(it) } ?: emptyMap())
  }

  @ReactMethod
  fun hideBubble() {
    DriverOverlayBubbleController.hide()
  }

  @ReactMethod
  fun hasOverlayPermission(promise: Promise) {
    promise.resolve(DriverOverlayBubbleController.hasPermission(reactContext))
  }

  @ReactMethod
  fun requestOverlayPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !DriverOverlayBubbleController.hasPermission(reactContext)) {
      reactContext.startActivity(DriverOverlayBubbleController.permissionIntent(reactContext))
    }
  }

  @ReactMethod
  fun hasFullScreenIntentPermission(promise: Promise) {
    promise.resolve(DriverNotificationManager.canUseFullScreenIntent(reactContext))
  }

  @ReactMethod
  fun requestFullScreenIntentPermission() {
    if (!DriverNotificationManager.canUseFullScreenIntent(reactContext)) {
      reactContext.startActivity(DriverNotificationManager.fullScreenIntentSettingsIntent(reactContext))
    }
  }

  @ReactMethod
  fun hasBatteryOptimizationExempt(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val pm = reactContext.getSystemService(PowerManager::class.java)
      promise.resolve(pm?.isIgnoringBatteryOptimizations(reactContext.packageName) == true)
    } catch (e: Exception) {
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun requestBatteryOptimizationExempt() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val pm = reactContext.getSystemService(PowerManager::class.java)
      if (pm?.isIgnoringBatteryOptimizations(reactContext.packageName) == true) return
      // Package-scoped dialog — not the generic battery list.
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      try {
        val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(fallback)
      } catch (_: Exception) {
        /* no-op */
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String?) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  private fun readableMapToStrings(map: ReadableMap): Map<String, String> {
    val out = mutableMapOf<String, String>()
    val iterator = map.keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      if (!map.isNull(key)) {
        out[key] = when (map.getType(key)) {
          ReadableType.String -> map.getString(key).orEmpty()
          ReadableType.Number -> map.getDouble(key).toString()
          ReadableType.Boolean -> map.getBoolean(key).toString()
          else -> ""
        }
      }
    }
    return out
  }
}
