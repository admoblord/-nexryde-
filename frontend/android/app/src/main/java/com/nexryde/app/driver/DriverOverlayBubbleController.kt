package com.nexryde.app.driver

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Compatibility facade for the React Native bridge.
 *
 * The old implementation mixed WindowManager creation, rendering, touch,
 * countdown, audio, and API actions in this object. The facade now delegates to
 * the single-responsibility managers while preserving existing JS/native calls.
 */
object DriverOverlayBubbleController {
  interface OfferActionHandler {
    fun onAcceptOffer(offer: Map<String, String>)
    fun onDeclineOffer(offer: Map<String, String>)
    fun onOfferExpired(offer: Map<String, String>)
  }

  private var rideAlertManager: RideAlertManager? = null

  fun configure(manager: RideAlertManager) {
    rideAlertManager = manager
  }

  fun clear(manager: RideAlertManager) {
    if (rideAlertManager === manager) {
      rideAlertManager = null
    }
  }

  fun setActionHandler(handler: OfferActionHandler?) {
    // Kept for ABI/source compatibility. Actions are now owned by RideAlertManager.
  }

  fun hasPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context.applicationContext)
  }

  fun permissionIntent(context: Context): Intent {
    return Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.applicationContext.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  fun show(context: Context, status: String = "online", badge: Int = 0) {
    rideAlertManager?.renderState(status)
  }

  fun showOfferCard(context: Context, offer: Map<String, String>) {
    rideAlertManager?.present(offer)
  }

  fun update(status: String = "online", badge: Int = 0, offer: Map<String, String> = emptyMap()) {
    rideAlertManager?.renderState(status, offer)
  }

  fun markAccepting() {
    rideAlertManager?.markAccepting()
  }

  fun markDeclining() {
    rideAlertManager?.markDeclining()
  }

  fun markAccepted() {
    rideAlertManager?.markAccepted()
  }

  fun markDeclined() {
    rideAlertManager?.markDeclined()
  }

  fun markActionFailed(message: String = "Try again") {
    rideAlertManager?.markFailed(message)
  }

  fun removeCard() {
    rideAlertManager?.stopAlert()
  }

  fun hide() {
    rideAlertManager?.hide()
  }
}
