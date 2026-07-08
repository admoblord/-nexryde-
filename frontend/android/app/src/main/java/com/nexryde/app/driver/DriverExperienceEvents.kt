package com.nexryde.app.driver

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Small event bridge used by native Android UI (overlay/full-screen buttons)
 * to ask JS business logic to accept/decline/open navigation. Native owns the
 * Android surface; JS remains the source of truth for ride mutations.
 */
object DriverExperienceEvents {
  private var reactContext: ReactApplicationContext? = null

  fun bind(context: ReactApplicationContext) {
    reactContext = context
  }

  fun emit(action: String, payload: Map<String, Any?> = emptyMap()) {
    val context = reactContext ?: return
    val map = com.facebook.react.bridge.Arguments.createMap()
    map.putString("action", action)
    payload.forEach { (key, value) ->
      when (value) {
        null -> map.putNull(key)
        is String -> map.putString(key, value)
        is Int -> map.putInt(key, value)
        is Double -> map.putDouble(key, value)
        is Float -> map.putDouble(key, value.toDouble())
        is Boolean -> map.putBoolean(key, value)
        else -> map.putString(key, value.toString())
      }
    }
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("NexrydeDriverNativeAction", map)
  }
}
