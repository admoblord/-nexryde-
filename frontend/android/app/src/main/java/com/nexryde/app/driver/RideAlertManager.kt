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
  private var refreshToken: String? = null
  private var backendUrl: String? = null
  private var online = false

  fun updateSession(
    driverId: String?,
    token: String?,
    backendUrl: String?,
    refreshToken: String? = null,
  ) {
    // Never overwrite a good session with blank extras from JS showRideAlert.
    this.driverId = driverId?.takeIf { it.isNotBlank() } ?: this.driverId
    this.token = token?.takeIf { it.isNotBlank() } ?: this.token
    this.backendUrl = backendUrl?.takeIf { it.isNotBlank() } ?: this.backendUrl
    this.refreshToken = refreshToken?.takeIf { it.isNotBlank() } ?: this.refreshToken
    persistSession()
  }

  private fun persistSession() {
    val prefs = appContext.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE).edit()
    driverId?.takeIf { it.isNotBlank() }?.let { prefs.putString(PREF_DRIVER_ID, it) }
    token?.takeIf { it.isNotBlank() }?.let { prefs.putString(PREF_TOKEN, it) }
    refreshToken?.takeIf { it.isNotBlank() }?.let { prefs.putString(PREF_REFRESH, it) }
    backendUrl?.takeIf { it.isNotBlank() }?.let { prefs.putString(PREF_BACKEND, it) }
    prefs.apply()
  }

  private fun ensureSessionLoaded() {
    if (
      !token.isNullOrBlank() &&
      !driverId.isNullOrBlank() &&
      !backendUrl.isNullOrBlank() &&
      !refreshToken.isNullOrBlank()
    ) {
      return
    }
    val prefs = appContext.getSharedPreferences(SESSION_PREFS, Context.MODE_PRIVATE)
    if (driverId.isNullOrBlank()) driverId = prefs.getString(PREF_DRIVER_ID, null)
    if (token.isNullOrBlank()) token = prefs.getString(PREF_TOKEN, null)
    if (refreshToken.isNullOrBlank()) refreshToken = prefs.getString(PREF_REFRESH, null)
    if (backendUrl.isNullOrBlank()) backendUrl = prefs.getString(PREF_BACKEND, null)
  }

  private fun refreshAccessTokenIfNeeded(): Boolean {
    ensureSessionLoaded()
    val refresh = refreshToken?.takeIf { it.isNotBlank() } ?: return false
    val base = backendUrl?.trim()?.trimEnd('/') ?: return false
    return runCatching {
      val body = JSONObject().put("refresh_token", refresh)
      val conn = (URL("$base/api/auth/refresh-token").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 10_000
        readTimeout = 12_000
        setRequestProperty("Content-Type", "application/json")
        doOutput = true
      }
      OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
      val status = conn.responseCode
      val stream = if (status in 200..299) conn.inputStream else conn.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      conn.disconnect()
      if (status !in 200..299) {
        Log.w(TAG, "native_token_refresh_failed status=$status")
        return@runCatching false
      }
      val json = JSONObject(text)
      val access = json.optString("access_token").ifBlank { json.optString("token") }
      val nextRefresh = json.optString("refresh_token")
      if (access.isBlank()) return@runCatching false
      token = access
      if (nextRefresh.isNotBlank()) refreshToken = nextRefresh
      persistSession()
      true
    }.getOrDefault(false)
  }

  fun goOnline() {
    online = true
    // Prepare the ringtone now so the first offer rings instantly instead of
    // spending decode time while the countdown is already running.
    audioManager.prewarm()
    showOnline()
  }

  fun goOffline() {
    online = false
    hide()
    audioManager.release()
  }

  fun isOnline(): Boolean = online

  /**
   * Draw the shift bubble without disturbing an offer card that already owns the
   * surface. Used when JS asserts the bubble as the app is minimised.
   */
  fun ensureVisible(status: String) {
    online = true
    if (stateManager.state.isExpanded) return
    renderState(status)
  }

  /**
   * The user just left the app (Home / recents). Draw the bubble straight away
   * instead of waiting for JS AppState to round-trip over the bridge, which is
   * what made the bubble appear a beat late after minimising.
   */
  fun onAppMinimized() {
    if (!online) return
    // An offer card already owns the surface — never replace it with the bubble.
    if (stateManager.state.isExpanded) return
    if (currentOffer != null) return
    render(if (stateManager.state.phase == OverlayPhase.ON_TRIP) stateManager.onTrip() else stateManager.online())
  }

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
    // Always tear down — including full-screen alert. Soft-ignore left FS ringing
    // after JS accept, then expire→finish dumped drivers to the launcher.
    dismissOfferSurface(
      tripId = active?.tripId,
      offerId = active?.offerId,
      bringAppForward = DriverRideAlertActivity.hasActiveAlert(active?.tripId, active?.offerId),
    )
  }

  /** Close overlay + FS alert; bring MainActivity forward before finish when FS is up. */
  private fun dismissOfferSurface(
    tripId: String?,
    offerId: String?,
    bringAppForward: Boolean,
  ) {
    stopCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    currentOffer = null
    actionInFlight = false
    val fsActive = DriverRideAlertActivity.hasActiveAlert(tripId, offerId)
    if (fsActive) {
      if (bringAppForward) openApp()
      handler.postDelayed({
        DriverRideAlertActivity.finishActiveAlert(tripId, offerId)
      }, 220)
    }
    if (online) render(stateManager.online()) else overlayManager.hide()
  }

  fun hide() {
    val active = currentOffer
    Log.i(TAG, "hide_alert_surface tripId=${active?.tripId} offerId=${active?.offerId}")
    online = false
    // Force offline must tear down FS too — soft-ignore left ringtone + stuck alert.
    dismissOfferSurface(
      tripId = active?.tripId,
      offerId = active?.offerId,
      bringAppForward = DriverRideAlertActivity.hasActiveAlert(active?.tripId, active?.offerId),
    )
    overlayManager.hide()
    stateManager.hide()
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
    pauseCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
    if (!online) return
    render(stateManager.accepting())
  }

  fun markDeclining() {
    pauseCountdown()
    audioManager.stop()
    notificationManager.cancelOfferNotification()
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
    ensureSessionLoaded()
    val tripId = offer.tripId
    val driver = driverId.orEmpty()
    var bearer = token.orEmpty()
    if (tripId.isBlank() || driver.isBlank()) {
      Log.w(TAG, "accept_blocked_missing_session tripId=$tripId offerId=${offer.offerId} driverPresent=${driver.isNotBlank()} tokenPresent=${bearer.isNotBlank()}")
      markFailed("Open app to accept")
      DriverRideAlertActivity.markActionRetryable(tripId, offer.offerId, "Open NEXRYDE to accept, then retry.")
      return
    }
    if (bearer.isBlank() && !refreshAccessTokenIfNeeded()) {
      markFailed("Open app to accept")
      DriverRideAlertActivity.markActionRetryable(tripId, offer.offerId, "Open NEXRYDE to accept, then retry.")
      return
    }
    bearer = token.orEmpty()
    actionInFlight = true
    Log.i(TAG, "accept_start tripId=$tripId offerId=${offer.offerId}")
    markAccepting()
    // Tell JS an accept HTTP is in flight so its offer countdown does not auto-decline
    // the ride out from under this native accept.
    DriverExperienceEvents.emit(
      "native_action_pending",
      mapOf("tripId" to tripId, "offerId" to offer.offerId, "kind" to "accept")
    )
    DriverRideAlertActivity.markActionBusy(tripId, offer.offerId, "Accepting ride...")

    Thread {
      val result = runCatching {
        val body = JSONObject().apply {
          put("driver_id", driver)
          offer.offerId.takeIf { it.isNotBlank() }?.let { put("offer_id", it) }
          parseFare(offer.fare)?.let { put("proposed_fare", it) }
        }
        var response = putJson("/api/trips/${urlEncode(tripId)}/accept", body, bearer)
        if (response.first == 401 && refreshAccessTokenIfNeeded()) {
          bearer = token.orEmpty()
          response = putJson("/api/trips/${urlEncode(tripId)}/accept", body, bearer)
        }
        response
      }
      handler.post {
        actionInFlight = false
        val response = result.getOrNull()
        // Server accept is authoritative — never drop success if UI cleared mid-flight.
        if (response != null && response.first in 200..299) {
          Log.i(TAG, "accept_success tripId=$tripId offerId=${offer.offerId} status=${response.first}")
          markAccepted()
          DriverExperienceEvents.emit(
            "native_accept_success",
            mapOf("tripId" to tripId, "offerId" to offer.offerId, "tripJson" to response.second)
          )
          dismissOfferSurface(tripId, offer.offerId, bringAppForward = true)
          return@post
        }
        val stillCurrent = currentOffer?.tripId == tripId && currentOffer?.offerId == offer.offerId
        if (!stillCurrent) {
          Log.i(TAG, "accept_result_ignored_after_lifecycle_end tripId=$tripId offerId=${offer.offerId}")
          return@post
        }
        val message = response?.second?.takeIf { it.isNotBlank() } ?: result.exceptionOrNull()?.message ?: "Could not accept"
        Log.w(TAG, "accept_failed tripId=$tripId offerId=${offer.offerId} status=${response?.first} message=$message")
        markFailed("Try again")
        DriverRideAlertActivity.markActionRetryable(tripId, offer.offerId, "Accept failed. Check connection and tap Accept again.")
        DriverExperienceEvents.emit(
          "native_accept_failed",
          mapOf("tripId" to tripId, "offerId" to offer.offerId, "message" to message)
        )
        // Resume expiry so a failed accept cannot leave the offer stuck forever.
        if (countdownSeconds < 8) countdownSeconds = 8
        startCountdown()
      }
    }.start()
  }

  private fun declineCurrentOffer() {
    val offer = currentOffer ?: return
    if (actionInFlight) return
    ensureSessionLoaded()
    val offerId = offer.offerId
    val driver = driverId.orEmpty()
    var bearer = token.orEmpty()
    if (offerId.isBlank() || driver.isBlank()) {
      Log.w(TAG, "decline_missing_session tripId=${offer.tripId} offerId=$offerId driverPresent=${driver.isNotBlank()} tokenPresent=${bearer.isNotBlank()}")
      markFailed("Try again")
      DriverRideAlertActivity.markActionRetryable(offer.tripId, offerId, "Could not decline yet. Open NEXRYDE or retry.")
      return
    }
    // Mirror accept: refresh a blank/expired token instead of failing outright.
    if (bearer.isBlank() && !refreshAccessTokenIfNeeded()) {
      markFailed("Try again")
      DriverRideAlertActivity.markActionRetryable(offer.tripId, offerId, "Could not decline yet. Open NEXRYDE or retry.")
      return
    }
    bearer = token.orEmpty()
    actionInFlight = true
    Log.i(TAG, "decline_start tripId=${offer.tripId} offerId=$offerId")
    markDeclining()
    DriverRideAlertActivity.markActionBusy(offer.tripId, offerId, "Declining ride...")

    Thread {
      val result = runCatching {
        val body = JSONObject().apply { put("driver_id", driver) }
        var response = putJson("/api/trips/offers/${urlEncode(offerId)}/decline", body, bearer)
        if (response.first == 401 && refreshAccessTokenIfNeeded()) {
          bearer = token.orEmpty()
          response = putJson("/api/trips/offers/${urlEncode(offerId)}/decline", body, bearer)
        }
        response
      }
      handler.post {
        actionInFlight = false
        val response = result.getOrNull()
        if (response != null && response.first in 200..299) {
          Log.i(TAG, "decline_complete tripId=${offer.tripId} offerId=$offerId status=${response.first}")
          markDeclined()
          DriverExperienceEvents.emit(
            "native_decline_success",
            mapOf("tripId" to offer.tripId, "offerId" to offerId, "responseJson" to response.second)
          )
          dismissOfferSurface(offer.tripId, offerId, bringAppForward = true)
          return@post
        }
        val stillCurrent = currentOffer?.tripId == offer.tripId && currentOffer?.offerId == offerId
        if (!stillCurrent) {
          Log.i(TAG, "decline_result_ignored_after_lifecycle_end tripId=${offer.tripId} offerId=$offerId")
          return@post
        }
        val message = response?.second?.takeIf { it.isNotBlank() } ?: result.exceptionOrNull()?.message ?: "Could not decline"
        Log.w(TAG, "decline_failed tripId=${offer.tripId} offerId=$offerId status=${response?.first} message=$message")
        markFailed("Try again")
        DriverRideAlertActivity.markActionRetryable(offer.tripId, offerId, "Decline failed. Check connection and tap Decline again.")
        DriverExperienceEvents.emit(
          "native_decline_failed",
          mapOf("tripId" to offer.tripId, "offerId" to offerId, "message" to message)
        )
      }
    }.start()
  }

  private fun startCountdown() {
    handler.removeCallbacks(countdownRunnable)
    if (countdownSeconds <= 0) countdownSeconds = OFFER_COUNTDOWN_SECONDS
    handler.postDelayed(countdownRunnable, 1000)
  }

  /** Stop ticks without wiping remaining seconds (accept/decline in flight). */
  private fun pauseCountdown() {
    handler.removeCallbacks(countdownRunnable)
  }

  private val countdownRunnable = object : Runnable {
    override fun run() {
      // Accept/decline in flight — never expire/dismiss under the HTTP call.
      if (actionInFlight) {
        handler.postDelayed(this, 1000)
        return
      }
      countdownSeconds -= 1
      if (countdownSeconds <= 0) {
        val expired = currentOffer
        Log.i(TAG, "offer_timeout tripId=${expired?.tripId} offerId=${expired?.offerId}")
        DriverExperienceEvents.emit("native_offer_expired", mapOf("tripId" to expired?.tripId, "offerId" to expired?.offerId))
        // Always bring MainActivity forward — finishing FS alone drops to launcher.
        dismissOfferSurface(expired?.tripId, expired?.offerId, bringAppForward = true)
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
    // REORDER_TO_FRONT only — CLEAR_TOP can remount splash/root and feel like a crash.
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    )
    try {
      appContext.startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "openApp_failed ${e.message}")
    }
  }

  companion object {
    private const val TAG = "NexrydeFullScreen"
    /** Keep in sync with DRIVER_OFFER_COUNTDOWN_SECONDS; must stay under RT_OFFER_TTL_SEC (45s). */
    private const val OFFER_COUNTDOWN_SECONDS = 30
    private const val SESSION_PREFS = "nexryde_driver_native_session"
    private const val PREF_DRIVER_ID = "driver_id"
    private const val PREF_TOKEN = "token"
    private const val PREF_REFRESH = "refresh_token"
    private const val PREF_BACKEND = "backend_url"
  }
}
