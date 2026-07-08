package com.nexryde.app.driver

import android.os.Build
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
