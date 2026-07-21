package com.nexryde.app.driver

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class RideAlertManager(
  context: Context,
  private val audioManager: DriverAlertAudioManager,
  private val notificationManager: DriverNotificationManager
) {
  private val appContext = context.applicationContext
  private val handler = Handler(Looper.getMainLooper())
  private val stateManager = OverlayStateManager()
  private val overlayManager = OverlayManager(
    appContext,
    stateManager,
    onAccept = { acceptCurrentOffer() },
    onDecline = { declineCurrentOffer() }
  )
  private var currentOffer: OverlayOffer? = null
  private var actionInFlight = false
  private var countdownSeconds = 0
  private var driverId: String? = null
  private var token: String? = null
  private var backendUrl: String? = null
  private var online = false

  fun updateSession(driverId: String?, token: String?, backendUrl: String?) {
    this.driverId = driverId ?: this.driverId
    this.token = token ?: this.token
    this.backendUrl = backendUrl ?: this.backendUrl
  }

  fun goOnline() {
    online = true
    showOnline()
  }

  fun goOffline() {
    online = false
    hide()
  }

  fun isOnline(): Boolean = online

  fun showOnline() {
    if (!online) return
    render(stateManager.online())
  }

  fun showOnTrip() {
    if (!online) return
    render(stateManager.onTrip())
  }

  fun present(rawOffer: Map<String, String>) {
    if (!online) return
    val offer = OverlayOffer.from(rawOffer)
    // Same offer re-delivered (WS + setState) must not restart audio/countdown/overlay.
    if (
      currentOffer != null &&
      offer.offerId.isNotBlank() &&
      currentOffer!!.offerId == offer.offerId
    ) {
      Log.i(TAG, "present_offer_deduped tripId=${offer.tripId} offerId=${offer.offerId}")
      return
    }
    Log.i(TAG, "present_offer tripId=${offer.tripId} offerId=${offer.offerId}")
    currentOffer = offer
    actionInFlight = false
    countdownSeconds = OFFER_COUNTDOWN_SECONDS
    notificationManager.updatePersistent("New ride request")
    audioManager.start()
    notificationManager.showOfferNotification(offer)
    render(stateManager.offer(offer, countdownSeconds))
    startCountdown()
  }

  fun stopAlert() {
    val active = currentOffer
    Log.i(TAG, "stop_alert tripId=${active?.tripId} offerId=${active?.offerId}")
    if (active != null && DriverRideAlertActivity.hasActiveAlert(active.tripId, active.offerId)) {
      Log.i(TAG, "stop_alert_ignored_active_full_screen tripId=${active.tripId} offerId=${active.offerId}")
      return
    }
    Log.i(TAG, "stop_alert_preserves_full_screen_activity")
    stopCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    currentOffer = null
    actionInFlight = false
    if (online) render(stateManager.online()) else overlayManager.hide()
  }

  fun hide() {
    val active = currentOffer
    Log.i(TAG, "hide_alert_surface tripId=${active?.tripId} offerId=${active?.offerId}")
    if (active != null && DriverRideAlertActivity.hasActiveAlert(active.tripId, active.offerId)) {
      Log.i(TAG, "hide_ignored_active_full_screen tripId=${active.tripId} offerId=${active.offerId}")
      return
    }
    Log.i(TAG, "hide_preserves_full_screen_activity")
    online = false
    stopCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    overlayManager.hide()
    stateManager.hide()
    currentOffer = null
    actionInFlight = false
  }

  fun accept(rawOffer: Map<String, String>) {
    if (actionInFlight) return
    currentOffer = OverlayOffer.from(rawOffer)
    acceptCurrentOffer()
  }

  fun decline(rawOffer: Map<String, String>) {
    if (actionInFlight) return
    currentOffer = OverlayOffer.from(rawOffer)
    declineCurrentOffer()
  }

  fun hasOverlayPermission(): Boolean = overlayManager.hasPermission()

  fun permissionIntent(): Intent = overlayManager.permissionIntent()

  fun renderState(status: String, offer: Map<String, String> = emptyMap()) {
    if (offer.isNotEmpty()) currentOffer = OverlayOffer.from(offer)
    when (status) {
      "offline" -> hide()
      "on_trip", "arrived" -> if (online) showOnTrip()
      "offer", "countdown" -> if (online) currentOffer?.let { present(it.toMap()) }
      else -> if (online) showOnline()
    }
  }

  fun markAccepting() {
    if (!online) return
    render(stateManager.accepting())
  }

  fun markDeclining() {
    if (!online) return
    render(stateManager.declining())
  }

  fun markAccepted() {
    stopCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    notificationManager.updatePersistent("Ride accepted")
    if (online) render(stateManager.onTrip()) else overlayManager.hide()
  }

  fun markDeclined() {
    stopCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    if (online) render(stateManager.online()) else overlayManager.hide()
  }

  fun markFailed(message: String) {
    if (!online) return
    render(stateManager.failed(message))
  }

  private fun acceptCurrentOffer() {
    val offer = currentOffer ?: return
    if (actionInFlight) return
    val tripId = offer.tripId
    val driver = driverId.orEmpty()
    val bearer = token.orEmpty()
    if (tripId.isBlank() || driver.isBlank() || bearer.isBlank()) {
      Log.w(TAG, "accept_blocked_missing_session tripId=$tripId offerId=${offer.offerId} driverPresent=${driver.isNotBlank()} tokenPresent=${bearer.isNotBlank()}")
      markFailed("Open app to accept")
      DriverRideAlertActivity.markActionRetryable(tripId, offer.offerId, "Open NEXRYDE to accept, then retry.")
      return
    }
    actionInFlight = true
    Log.i(TAG, "accept_start tripId=$tripId offerId=${offer.offerId}")
    markAccepting()
    DriverRideAlertActivity.markActionBusy(tripId, offer.offerId, "Accepting ride...")

    Thread {
      val result = runCatching {
        val body = JSONObject().apply {
          put("driver_id", driver)
          offer.offerId.takeIf { it.isNotBlank() }?.let { put("offer_id", it) }
          parseFare(offer.fare)?.let { put("proposed_fare", it) }
        }
        putJson("/api/trips/${urlEncode(tripId)}/accept", body, bearer)
      }
      handler.post {
        actionInFlight = false
        val stillCurrent = currentOffer?.tripId == tripId && currentOffer?.offerId == offer.offerId
        if (!stillCurrent) {
          Log.i(TAG, "accept_result_ignored_after_lifecycle_end tripId=$tripId offerId=${offer.offerId}")
          return@post
        }
        val response = result.getOrNull()
        if (response != null && response.first in 200..299) {
          Log.i(TAG, "accept_success tripId=$tripId offerId=${offer.offerId} status=${response.first}")
          DriverRideAlertActivity.finishActiveAlert(tripId, offer.offerId)
          currentOffer = null
          markAccepted()
          DriverExperienceEvents.emit(
            "native_accept_success",
            mapOf("tripId" to tripId, "offerId" to offer.offerId, "tripJson" to response.second)
          )
          openApp()
        } else {
          val message = response?.second?.takeIf { it.isNotBlank() } ?: result.exceptionOrNull()?.message ?: "Could not accept"
          Log.w(TAG, "accept_failed tripId=$tripId offerId=${offer.offerId} status=${response?.first} message=$message")
          markFailed("Try again")
          DriverRideAlertActivity.markActionRetryable(tripId, offer.offerId, "Accept failed. Check connection and tap Accept again.")
          DriverExperienceEvents.emit(
            "native_accept_failed",
            mapOf("tripId" to tripId, "offerId" to offer.offerId, "message" to message)
          )
        }
      }
    }.start()
  }

  private fun declineCurrentOffer() {
    val offer = currentOffer ?: return
    if (actionInFlight) return
    val offerId = offer.offerId
    val driver = driverId.orEmpty()
    val bearer = token.orEmpty()
    if (offerId.isBlank() || driver.isBlank() || bearer.isBlank()) {
      Log.w(TAG, "decline_missing_session tripId=${offer.tripId} offerId=$offerId driverPresent=${driver.isNotBlank()} tokenPresent=${bearer.isNotBlank()}")
      markFailed("Try again")
      DriverRideAlertActivity.markActionRetryable(offer.tripId, offerId, "Could not decline yet. Open NEXRYDE or retry.")
      return
    }
    actionInFlight = true
    Log.i(TAG, "decline_start tripId=${offer.tripId} offerId=$offerId")
    markDeclining()
    DriverRideAlertActivity.markActionBusy(offer.tripId, offerId, "Declining ride...")

    Thread {
      val result = runCatching {
        val body = JSONObject().apply { put("driver_id", driver) }
        putJson("/api/trips/offers/${urlEncode(offerId)}/decline", body, bearer)
      }
      handler.post {
        actionInFlight = false
        val stillCurrent = currentOffer?.tripId == offer.tripId && currentOffer?.offerId == offerId
        if (!stillCurrent) {
          Log.i(TAG, "decline_result_ignored_after_lifecycle_end tripId=${offer.tripId} offerId=$offerId")
          return@post
        }
        val response = result.getOrNull()
        if (response != null && response.first in 200..299) {
          Log.i(TAG, "decline_complete tripId=${offer.tripId} offerId=$offerId status=${response.first}")
          DriverRideAlertActivity.finishActiveAlert(offer.tripId, offerId)
          currentOffer = null
          markDeclined()
          DriverExperienceEvents.emit(
            "native_decline_success",
            mapOf("tripId" to offer.tripId, "offerId" to offerId, "responseJson" to response.second)
          )
        } else {
          val message = response?.second?.takeIf { it.isNotBlank() } ?: result.exceptionOrNull()?.message ?: "Could not decline"
          Log.w(TAG, "decline_failed tripId=${offer.tripId} offerId=$offerId status=${response?.first} message=$message")
          markFailed("Try again")
          DriverRideAlertActivity.markActionRetryable(offer.tripId, offerId, "Decline failed. Check connection and tap Decline again.")
          DriverExperienceEvents.emit(
            "native_decline_failed",
            mapOf("tripId" to offer.tripId, "offerId" to offerId, "message" to message)
          )
        }
      }
    }.start()
  }

  private fun startCountdown() {
    stopCountdown()
    handler.postDelayed(countdownRunnable, 1000)
  }

  private val countdownRunnable = object : Runnable {
    override fun run() {
      countdownSeconds -= 1
      if (countdownSeconds <= 0) {
        val expired = currentOffer
        Log.i(TAG, "offer_timeout tripId=${expired?.tripId} offerId=${expired?.offerId}")
        stopCountdown()
        audioManager.stop()
        notificationManager.cancelOfferNotification()
        currentOffer = null
        actionInFlight = false
        expired?.let { DriverRideAlertActivity.finishActiveAlert(it.tripId, it.offerId) }
        if (online) render(stateManager.online()) else overlayManager.hide()
        DriverExperienceEvents.emit("native_offer_expired", mapOf("tripId" to expired?.tripId, "offerId" to expired?.offerId))
        return
      }
      if (!online) {
        stopCountdown()
        overlayManager.hide()
        return
      }
      render(stateManager.countdown(countdownSeconds))
      handler.postDelayed(this, 1000)
    }
  }

  private fun stopCountdown() {
    handler.removeCallbacks(countdownRunnable)
    countdownSeconds = 0
  }

  private fun render(state: OverlayState) {
    overlayManager.render(state)
  }

  private fun putJson(path: String, body: JSONObject, bearer: String): Pair<Int, String> {
    val base = backendUrl?.trim()?.trimEnd('/') ?: throw IllegalStateException("Missing backend URL")
    val conn = (URL("$base$path").openConnection() as HttpURLConnection).apply {
      requestMethod = "PUT"
      connectTimeout = 10_000
      readTimeout = 12_000
      setRequestProperty("Authorization", "Bearer $bearer")
      setRequestProperty("Content-Type", "application/json")
      doOutput = true
    }
    OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
    val status = conn.responseCode
    val stream = if (status in 200..299) conn.inputStream else conn.errorStream
    val responseText = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
    conn.disconnect()
    return Pair(status, responseText)
  }

  private fun parseFare(raw: String?): Double? {
    val clean = raw?.replace(Regex("[^0-9.]"), "").orEmpty()
    return clean.toDoubleOrNull()?.takeIf { it > 0 }
  }

  private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

  private fun openApp() {
    val intent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("nexryde://action/open_app")).setPackage(appContext.packageName)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    appContext.startActivity(intent)
  }

  companion object {
    private const val TAG = "NexrydeFullScreen"
    private const val OFFER_COUNTDOWN_SECONDS = 20
  }
}
