package com.nexryde.app.floating

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native bridge for the floating driver bubble.
 *
 * JS usage:
 *   NativeModules.FloatingDriverBubble.show('online', null)
 *   NativeModules.FloatingDriverBubble.update('on_trip', 'To Ikeja')
 *   NativeModules.FloatingDriverBubble.hide()
 */
class FloatingDriverModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FloatingDriverBubble"

    // ── Show / launch ─────────────────────────────────────────────────────────
    @ReactMethod
    fun show(status: String, tripInfo: String?) {
        if (!hasOverlayPermission()) {
            requestOverlayPermission()
            return
        }
        val intent = Intent(reactContext, FloatingDriverService::class.java).apply {
            putExtra(FloatingDriverService.EXTRA_STATUS, status)
            if (!tripInfo.isNullOrBlank()) putExtra(FloatingDriverService.EXTRA_TRIP_INFO, tripInfo)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    // ── Update status while running ───────────────────────────────────────────
    @ReactMethod
    fun update(status: String, tripInfo: String?) {
        if (!FloatingDriverService.isRunning) return
        val intent = Intent(reactContext, FloatingDriverService::class.java).apply {
            putExtra(FloatingDriverService.EXTRA_STATUS, status)
            if (!tripInfo.isNullOrBlank()) putExtra(FloatingDriverService.EXTRA_TRIP_INFO, tripInfo)
        }
        reactContext.startService(intent)
    }

    // ── Stop / hide ───────────────────────────────────────────────────────────
    @ReactMethod
    fun hide() {
        reactContext.stopService(Intent(reactContext, FloatingDriverService::class.java))
    }

    // ── Query running state ───────────────────────────────────────────────────
    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(FloatingDriverService.isRunning)
    }

    // ── Overlay permission helpers ────────────────────────────────────────────
    @ReactMethod
    fun hasPermission(promise: Promise) {
        promise.resolve(hasOverlayPermission())
    }

    @ReactMethod
    fun requestPermission() {
        requestOverlayPermission()
    }

    private fun hasOverlayPermission(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(reactContext)
        else true

    private fun requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !hasOverlayPermission()) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            reactContext.startActivity(intent)
        }
    }
}
