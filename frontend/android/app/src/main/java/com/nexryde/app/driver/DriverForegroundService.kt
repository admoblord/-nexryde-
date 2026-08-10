package com.nexryde.app.driver

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioFocusRequest
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.nexryde.app.R
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Android-supported online-driver foreground service.
 *
 * It intentionally keeps business decisions in JS/backend. Native owns only
 * platform responsibilities that React Native cannot reliably perform while
 * backgrounded: foreground service, Android notification, location callbacks,
 * loud alert audio/vibration, full-screen intent, and overlay bubble.
 */
class DriverForegroundService : Service(), LocationListener, DriverOverlayBubbleController.OfferActionHandler {
  private val handler = Handler(Looper.getMainLooper())
  private var locationManager: LocationManager? = null
  private var lastLocation: Location? = null
  private var lastLocationUploadAtMs: Long = 0L
  private var token: String? = null
  private var backendUrl: String? = null
  private var driverId: String? = null
  /** Non-blank while driver has accepted/arrived/ongoing trip — blocks auto FORCE_OFFLINE teardown. */
  private var activeTripId: String? = null
  private var mediaPlayer: MediaPlayer? = null
  private var audioManager: AudioManager? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var overlayActionInFlight = false
  private var rideStatus: String = "Listening for rides"
  private lateinit var driverNotificationManager: DriverNotificationManager
  private lateinit var driverAlertAudioManager: DriverAlertAudioManager
  private lateinit var rideAlertManager: RideAlertManager

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    serviceProcessAlive = true
    createChannels(this)
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    driverNotificationManager = DriverNotificationManager(this)
    driverAlertAudioManager = DriverAlertAudioManager(this)
    rideAlertManager = RideAlertManager(this, driverAlertAudioManager, driverNotificationManager)
    DriverOverlayBubbleController.configure(rideAlertManager)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        // Explicit JS go-offline — always honor (clears trip flag first from JS).
        clearActiveTripLocked()
        stopOnlineService()
        return START_NOT_STICKY
      }
      ACTION_UPDATE_SESSION -> {
        if (!isDriverServiceOnline) {
          // Started via startService only — safe to stop without FGS promote.
          stopSelf()
          return START_NOT_STICKY
        }
        token = intent.getStringExtra(EXTRA_TOKEN) ?: token
        backendUrl = intent.getStringExtra(EXTRA_BACKEND_URL) ?: backendUrl
        val refreshToken = intent.getStringExtra(EXTRA_REFRESH_TOKEN)
        intent.getStringExtra(EXTRA_ACTIVE_TRIP_ID)?.let { setActiveTripId(it.ifBlank { null }) }
        rideAlertManager.updateSession(driverId, token, backendUrl, refreshToken)
        updatePersistentNotification()
        return START_STICKY
      }
      ACTION_SET_ACTIVE_TRIP -> {
        val tripId = intent.getStringExtra(EXTRA_ACTIVE_TRIP_ID)
        setActiveTripId(tripId?.ifBlank { null })
        if (isDriverServiceOnline) {
          rideStatus = if (!activeTripId.isNullOrBlank()) "On trip — stay online" else "Listening for rides"
          updatePersistentNotification()
        }
        return if (isDriverServiceOnline) START_STICKY else START_NOT_STICKY
      }
      ACTION_SHOW_OFFER -> {
        if (!isDriverServiceOnline) {
          cancelAllDriverNotifications()
          rideAlertManager.hide()
          stopSelf()
          return START_NOT_STICKY
        }
        (intent.getStringExtra(EXTRA_DRIVER_ID)?.takeIf { it.isNotBlank() }
          ?: intent.getStringExtra("driverId")?.takeIf { it.isNotBlank() })
          ?.let { driverId = it }
        (intent.getStringExtra(EXTRA_TOKEN)?.takeIf { it.isNotBlank() }
          ?: intent.getStringExtra("token")?.takeIf { it.isNotBlank() })
          ?.let { token = it }
        (intent.getStringExtra(EXTRA_BACKEND_URL)?.takeIf { it.isNotBlank() }
          ?: intent.getStringExtra("backendUrl")?.takeIf { it.isNotBlank() })
          ?.let { backendUrl = it }
        val refresh = intent.getStringExtra(EXTRA_REFRESH_TOKEN)?.takeIf { it.isNotBlank() }
          ?: intent.getStringExtra("refreshToken")?.takeIf { it.isNotBlank() }
        rideAlertManager.updateSession(driverId, token, backendUrl, refresh)
        if (!promoteToForeground(requireLocation = true)) {
          return abortForegroundStart("show_offer_promote_failed")
        }
        presentRideAlert(extrasToOffer(intent))
        return START_STICKY
      }
      ACTION_ACCEPT_OFFER -> {
        if (!isDriverServiceOnline) {
          cancelAllDriverNotifications()
          rideAlertManager.hide()
          stopSelf()
          return START_NOT_STICKY
        }
        if (!promoteToForeground(requireLocation = true)) {
          return abortForegroundStart("accept_offer_promote_failed")
        }
        acceptOfferFromOverlay(extrasToOffer(intent))
        return START_STICKY
      }
      ACTION_DECLINE_OFFER -> {
        if (!isDriverServiceOnline) {
          cancelAllDriverNotifications()
          rideAlertManager.hide()
          stopSelf()
          return START_NOT_STICKY
        }
        if (!promoteToForeground(requireLocation = true)) {
          return abortForegroundStart("decline_offer_promote_failed")
        }
        declineOfferFromOverlay(extrasToOffer(intent))
        return START_STICKY
      }
      ACTION_STOP_ALERT -> {
        if (!isDriverServiceOnline) {
          cancelAllDriverNotifications()
          rideAlertManager.hide()
          stopSelf()
          return START_NOT_STICKY
        }
        rideAlertManager.stopAlert()
        return START_STICKY
      }
      ACTION_START, null -> {
        return startOnlineFromIntent(intent)
      }
      else -> {
        return startOnlineFromIntent(intent)
      }
    }
  }

  private fun startOnlineFromIntent(intent: Intent?): Int {
    driverId = intent?.getStringExtra(EXTRA_DRIVER_ID) ?: driverId
    token = intent?.getStringExtra(EXTRA_TOKEN) ?: token
    backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: backendUrl
    // Sticky restart / process death: intent extras may be null — restore session prefs.
    rideAlertManager.updateSession(
      driverId,
      token,
      backendUrl,
      intent?.getStringExtra(EXTRA_REFRESH_TOKEN),
    )
    if (driverId.isNullOrBlank() || token.isNullOrBlank() || backendUrl.isNullOrBlank()) {
      restoreSessionFromAlertManager()
    }
    rideStatus = intent?.getStringExtra(EXTRA_STATUS) ?: "Listening for rides"

    // After startForegroundService(), Android requires a successful startForeground()
    // before any stopSelf(). Never abort with bare stopSelf on this path.
    if (!hasLocationPermission()) {
      return abortForegroundStart("refuse_start_missing_location_permission")
    }
    if (!promoteToForeground(requireLocation = true)) {
      return abortForegroundStart("start_promote_failed")
    }
    isDriverServiceOnline = true
    persistWasOnline(true)
    restoreActiveTripFromPrefs()
    rideAlertManager.goOnline()
    startLocationUpdates()
    scheduleHeartbeat()
    scheduleLocationUpload()
    replayPendingOfferIfFresh()
    return START_STICKY
  }

  private fun replayPendingOfferIfFresh() {
    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val raw = prefs.getString(PENDING_OFFER_KEY, null) ?: return
    prefs.edit().remove(PENDING_OFFER_KEY).apply()
    runCatching {
      val json = JSONObject(raw)
      val ts = json.optLong("__ts", 0L)
      // Ride offers are ~20s TTL — never replay a stale one on a later shift.
      if (ts <= 0L || System.currentTimeMillis() - ts > 18_000L) return@runCatching
      val replay = Intent(this, DriverForegroundService::class.java).apply {
        action = ACTION_SHOW_OFFER
        val keys = json.keys()
        while (keys.hasNext()) {
          val k = keys.next()
          if (k != "__ts") putExtra(k, json.optString(k))
        }
      }
      startService(replay)
    }
  }

  private fun restoreSessionFromAlertManager() {
    // RideAlertManager.ensureSessionLoaded is private; re-hydrate via updateSession no-ops
    // after reading prefs the same way accept/decline does.
    val prefs = getSharedPreferences("nexryde_driver_native_session", Context.MODE_PRIVATE)
    if (driverId.isNullOrBlank()) driverId = prefs.getString("driver_id", null)
    if (token.isNullOrBlank()) token = prefs.getString("token", null)
    if (backendUrl.isNullOrBlank()) backendUrl = prefs.getString("backend_url", null)
    val refresh = prefs.getString("refresh_token", null)
    rideAlertManager.updateSession(driverId, token, backendUrl, refresh)
    Log.i(TAG, "session_restored_from_prefs driver=${!driverId.isNullOrBlank()} token=${!token.isNullOrBlank()}")
  }

  private fun persistWasOnline(online: Boolean) {
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(PREF_WAS_ONLINE, online)
      .apply()
  }

  /**
   * Satisfy the Android 14+ FGS contract for a service that declares
   * foregroundServiceType=location|dataSync.
   *
   * - Always use the typed startForeground overload on API 34+.
   * - Never claim LOCATION without runtime location permission.
   * - DATA_SYNC-only is used for legal demotion when location is unavailable.
   */
  private fun promoteToForeground(requireLocation: Boolean): Boolean {
    val notification = buildPersistentNotification()
    val wantLocation = requireLocation && hasLocationPermission()
    return try {
      when {
        Build.VERSION.SDK_INT >= 34 -> {
          val type =
            if (wantLocation) {
              ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION or
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
              ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            }
          startForeground(NOTIFICATION_ID, notification, type)
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> {
          if (wantLocation) {
            startForeground(
              NOTIFICATION_ID,
              notification,
              ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
          } else {
            // Q–33: cannot claim location without permission; 2-arg is the demotion path.
            startForeground(NOTIFICATION_ID, notification)
          }
        }
        else -> startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (e: SecurityException) {
      Log.e(TAG, "startForeground_security", e)
      false
    } catch (e: Exception) {
      Log.e(TAG, "startForeground_failed", e)
      false
    }
  }

  /**
   * Legal abort after startForegroundService: promote with a declared type, then tear down.
   * Bare stopSelf() here causes ForegroundServiceDidNotStartInTimeException.
   */
  private fun abortForegroundStart(reason: String): Int {
    Log.e(TAG, reason)
    isDriverServiceOnline = false
    // Prefer DATA_SYNC-only (no location) so promote can succeed without location permission.
    if (!promoteToForeground(requireLocation = false)) {
      // Last resort: still attempt an untyped promote on older APIs so the contract is met.
      runCatching { startForeground(NOTIFICATION_ID, buildPersistentNotification()) }
        .onFailure { Log.e(TAG, "abort_last_resort_startForeground_failed", it) }
    }
    runCatching { rideAlertManager.goOffline() }
    runCatching { cancelAllDriverNotifications() }
    runCatching { stopLocationUpdates() }
    handler.removeCallbacksAndMessages(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopLocationUpdates()
    handler.removeCallbacksAndMessages(null)
    rideAlertManager.hide()
    DriverOverlayBubbleController.clear(rideAlertManager)
    isDriverServiceOnline = false
    serviceProcessAlive = false
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (refuseAutoOffline("task_removed")) {
      // Keep FGS alive for the passenger trip; JS will reassert online when able.
      DriverExperienceEvents.emit(
        "heartbeat_force_offline",
        mapOf(
          "status" to 0,
          "source" to "task_removed_refused_active_trip",
          "activeTripId" to (activeTripId ?: ""),
          "refused" to true,
        ),
      )
      return
    }
    if (isDriverServiceOnline) {
      // Uber/Bolt behaviour: swiping the app from recents must NOT sign an online
      // driver off. The foreground service (and its native heartbeat/location) keep
      // running behind the persistent notification; only an explicit Go Offline
      // (ACTION_STOP) or a system process kill ends the shift.
      Log.i(TAG, "task_removed_kept_online — foreground service persists")
      super.onTaskRemoved(rootIntent)
      return
    }
    // Not online (edge) → safe to tear down and clear any ghost server state.
    postServerOfflineBestEffort()
    DriverExperienceEvents.emit(
      "heartbeat_force_offline",
      mapOf("status" to 0, "source" to "task_removed")
    )
    stopOnlineService()
    super.onTaskRemoved(rootIntent)
  }

  override fun onLocationChanged(location: Location) {
    lastLocation = location
    // Upload promptly when GPS moves; runnable covers quiet periods.
    maybeUploadDriverLocation(force = false)
  }

  @Deprecated("Deprecated by Android framework")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

  private fun startLocationUpdates() {
    if (!hasLocationPermission()) return
    runCatching {
      locationManager?.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        LOCATION_INTERVAL_MS,
        LOCATION_DISTANCE_M,
        this,
        Looper.getMainLooper()
      )
    }
    runCatching {
      locationManager?.requestLocationUpdates(
        LocationManager.NETWORK_PROVIDER,
        LOCATION_INTERVAL_MS,
        LOCATION_DISTANCE_M,
        this,
        Looper.getMainLooper()
      )
    }
  }

  private fun stopLocationUpdates() {
    runCatching { locationManager?.removeUpdates(this) }
  }

  private fun scheduleHeartbeat() {
    handler.removeCallbacks(heartbeatRunnable)
    handler.post(heartbeatRunnable)
  }

  private fun scheduleLocationUpload() {
    handler.removeCallbacks(locationUploadRunnable)
    handler.post(locationUploadRunnable)
  }

  private val heartbeatRunnable = object : Runnable {
    override fun run() {
      sendHeartbeat()
      handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
    }
  }

  private val locationUploadRunnable = object : Runnable {
    override fun run() {
      maybeUploadDriverLocation(force = true)
      handler.postDelayed(this, LOCATION_UPLOAD_INTERVAL_MS)
    }
  }

  private fun postServerOfflineBestEffort() {
    val base = backendUrl?.trim()?.trimEnd('/') ?: return
    val bearer = token?.takeIf { it.isNotBlank() } ?: return
    val id = driverId?.takeIf { it.isNotBlank() } ?: return
    Thread {
      runCatching {
        val url = URL("$base/api/drivers/${URLEncoder.encode(id, "UTF-8")}/online?is_online=false")
        val conn = (url.openConnection() as HttpURLConnection).apply {
          requestMethod = "PUT"
          connectTimeout = 4000
          readTimeout = 4000
          setRequestProperty("Authorization", "Bearer $bearer")
          setRequestProperty("Content-Type", "application/json")
          doOutput = true
        }
        OutputStreamWriter(conn.outputStream).use { it.write("{}") }
        conn.responseCode
        conn.disconnect()
      }
    }.start()
  }

  /**
   * Rider-visible pins + dispatch geo use PUT /drivers/{id}/location (~10s).
   * Heartbeat alone (60s) left background pins stale for up to a minute (audit 8.1).
   */
  private fun maybeUploadDriverLocation(force: Boolean) {
    val loc = lastLocation ?: return
    val now = System.currentTimeMillis()
    if (!force && now - lastLocationUploadAtMs < LOCATION_UPLOAD_INTERVAL_MS) return
    lastLocationUploadAtMs = now
    val base = backendUrl?.trim()?.trimEnd('/') ?: return
    val bearer = token?.takeIf { it.isNotBlank() } ?: return
    val id = driverId?.takeIf { it.isNotBlank() } ?: return
    val lat = loc.latitude
    val lng = loc.longitude
    Thread {
      runCatching {
        val url = URL("$base/api/drivers/${URLEncoder.encode(id, "UTF-8")}/location")
        val conn = (url.openConnection() as HttpURLConnection).apply {
          requestMethod = "PUT"
          connectTimeout = 8000
          readTimeout = 8000
          setRequestProperty("Authorization", "Bearer $bearer")
          setRequestProperty("Content-Type", "application/json")
          doOutput = true
        }
        val body = JSONObject()
          .put("latitude", lat)
          .put("longitude", lng)
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        val status = conn.responseCode
        conn.disconnect()
        if (status == 401) {
          val refuse = refuseAutoOffline("native_location_401")
          handler.post {
            if (refuse) {
              DriverExperienceEvents.emit(
                "heartbeat_force_offline",
                mapOf(
                  "status" to 401,
                  "source" to "native_location_401_refused_active_trip",
                  "activeTripId" to (activeTripId ?: companionActiveTripId ?: ""),
                  "refused" to true,
                ),
              )
              return@post
            }
            DriverExperienceEvents.emit("heartbeat_force_offline", mapOf("status" to 401, "source" to "native_location_401"))
            stopOnlineService()
          }
        }
      }.onFailure { Log.w(TAG, "location_upload_failed", it) }
    }.start()
  }

  private fun sendHeartbeat() {
    val base = backendUrl?.trim()?.trimEnd('/') ?: return
    val bearer = token?.takeIf { it.isNotBlank() } ?: return
    val loc = lastLocation
    Thread {
      runCatching {
        val url = URL("$base/api/driver/heartbeat")
        val conn = (url.openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = 8000
          readTimeout = 8000
          setRequestProperty("Authorization", "Bearer $bearer")
          setRequestProperty("Content-Type", "application/json")
          doOutput = true
        }
        val body = JSONObject()
        if (loc != null) {
          body.put("lat", loc.latitude)
          body.put("lng", loc.longitude)
        }
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        conn.disconnect()
        if (status == 401) {
          val refuse = refuseAutoOffline("native_401")
          handler.post {
            if (refuse) {
              DriverExperienceEvents.emit(
                "heartbeat_force_offline",
                mapOf(
                  "status" to 401,
                  "source" to "native_401_refused_active_trip",
                  "activeTripId" to (activeTripId ?: companionActiveTripId ?: ""),
                  "refused" to true,
                ),
              )
              return@post
            }
            DriverExperienceEvents.emit("heartbeat_force_offline", mapOf("status" to 401, "source" to "native_401"))
            stopOnlineService()
          }
          return@runCatching
        }
        if (status in 200..299 && raw.isNotBlank()) {
          val payload = JSONObject(raw)
          val action = payload.optString("action", "")
          val serverOnline = payload.optBoolean("server_online", true)
          if (action == "FORCE_OFFLINE" || !serverOnline) {
            val refuse = refuseAutoOffline("native_force_offline")
            handler.post {
              if (refuse) {
                DriverExperienceEvents.emit(
                  "heartbeat_force_offline",
                  mapOf(
                    "status" to status,
                    "source" to "native_force_offline_refused_active_trip",
                    "serverOnline" to serverOnline,
                    "activeTripId" to (activeTripId ?: companionActiveTripId ?: ""),
                    "refused" to true,
                  ),
                )
                rideStatus = "On trip — reconnecting"
                updatePersistentNotification()
                return@post
              }
              DriverExperienceEvents.emit(
                "heartbeat_force_offline",
                mapOf("status" to status, "source" to "native_force_offline", "serverOnline" to serverOnline)
              )
              stopOnlineService()
            }
          }
        }
      }
    }.start()
  }

  private fun updatePersistentNotification() {
    driverNotificationManager.updatePersistent(rideStatus)
  }

  private fun buildPersistentNotification(): Notification {
    return driverNotificationManager.buildPersistentNotification(rideStatus)
  }

  private fun presentRideAlert(offer: Map<String, String>) {
    rideStatus = "New ride request"
    overlayActionInFlight = false
    updatePersistentNotification()
    rideAlertManager.present(offer)
    // FGS can start activities while ringtone plays — don't depend on FSI alone.
    try {
      val intent = Intent(this, DriverRideAlertActivity::class.java).apply {
        addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_SINGLE_TOP or
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
            Intent.FLAG_ACTIVITY_NO_USER_ACTION,
        )
        offer.forEach { (key, value) -> putExtra(key, value) }
      }
      startActivity(intent)
      Log.i(TAG, "fgs_started_DriverRideAlertActivity tripId=${offer["tripId"]}")
    } catch (t: Throwable) {
      Log.e(TAG, "fgs_start_DriverRideAlertActivity_failed: ${t.message}", t)
    }
  }

  private fun launchIntent(uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(this, uri.hashCode(), intent, pendingFlags())
  }

  private fun startAlertPlayback() {
    driverAlertAudioManager.start()
  }

  private fun stopAlertPlayback() {
    driverAlertAudioManager.stop()
  }

  override fun onAcceptOffer(offer: Map<String, String>) {
    acceptOfferFromOverlay(offer)
  }

  override fun onDeclineOffer(offer: Map<String, String>) {
    declineOfferFromOverlay(offer)
  }

  override fun onOfferExpired(offer: Map<String, String>) {
    stopAlertPlayback()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(OFFER_NOTIFICATION_ID)
    DriverExperienceEvents.emit("native_offer_expired", mapOf("tripId" to offer["tripId"], "offerId" to offer["offerId"]))
  }

  private fun acceptOfferFromOverlay(offer: Map<String, String>) {
    rideAlertManager.accept(offer)
  }

  private fun declineOfferFromOverlay(offer: Map<String, String>) {
    rideAlertManager.decline(offer)
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

  private fun requestAlertAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setAudioAttributes(alertAudioAttributes())
        .setOnAudioFocusChangeListener { }
        .build()
      audioFocusRequest = request
      am.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonAlertAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
      audioFocusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
  }

  private fun alertAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
  }

  private fun parseFare(raw: String?): Double? {
    val clean = raw?.replace(Regex("[^0-9.]"), "").orEmpty()
    return clean.toDoubleOrNull()?.takeIf { it > 0 }
  }

  private fun urlEncode(value: String): String =
    URLEncoder.encode(value, "UTF-8")

  private fun cancelOfferNotification() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(OFFER_NOTIFICATION_ID)
  }

  private fun cancelAllDriverNotifications() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(OFFER_NOTIFICATION_ID)
    nm.cancel(NOTIFICATION_ID)
  }

  private fun openApp(uri: String) {
    val intent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName)
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    )
    try {
      startActivity(intent)
    } catch (_: Exception) {
      /* best-effort — never crash FGS for launch */
    }
  }

  private fun vibrateAlert() {
    val pattern = longArrayOf(0, 700, 250, 700, 250, 900)
    val vib = vibrator()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(pattern, 0)
    }
  }

  private fun vibrator(): Vibrator {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
      manager.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
  }

  private fun hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    return fine || coarse
  }

  private fun setActiveTripId(tripId: String?) {
    activeTripId = tripId?.takeIf { it.isNotBlank() }
    companionActiveTripId = activeTripId
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(PREF_ACTIVE_TRIP_ID, activeTripId)
      .apply()
    Log.i(TAG, "active_trip_id=${activeTripId ?: "<cleared>"}")
  }

  private fun clearActiveTripLocked() {
    activeTripId = null
    companionActiveTripId = null
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().remove(PREF_ACTIVE_TRIP_ID).apply()
  }

  private fun restoreActiveTripFromPrefs() {
    if (!activeTripId.isNullOrBlank()) return
    val stored = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(PREF_ACTIVE_TRIP_ID, null)
    if (!stored.isNullOrBlank()) {
      activeTripId = stored
      companionActiveTripId = stored
    }
  }

  /**
   * True when a live trip is known locally (JS push or prefs).
   * Used to refuse FORCE_OFFLINE / task-removed teardown while carrying a passenger.
   */
  private fun refuseAutoOffline(reason: String): Boolean {
    restoreActiveTripFromPrefs()
    val local = !activeTripId.isNullOrBlank() || !companionActiveTripId.isNullOrBlank()
    if (local) {
      Log.w(TAG, "refuse_auto_offline reason=$reason trip=${activeTripId ?: companionActiveTripId}")
      return true
    }
    // Last-chance server probe when JS never pushed a trip id (process death race).
    val probed = probeActiveTripBlocking()
    if (probed) {
      Log.w(TAG, "refuse_auto_offline reason=$reason via_server_probe")
    }
    return probed
  }

  private fun probeActiveTripBlocking(): Boolean {
    val base = backendUrl?.trim()?.trimEnd('/') ?: return false
    val bearer = token?.takeIf { it.isNotBlank() } ?: return false
    val id = driverId?.takeIf { it.isNotBlank() } ?: return false
    return runCatching {
      val url = URL("$base/api/trips/active/${URLEncoder.encode(id, "UTF-8")}")
      val conn = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 2500
        readTimeout = 2500
        setRequestProperty("Authorization", "Bearer $bearer")
      }
      val status = conn.responseCode
      val stream = if (status in 200..299) conn.inputStream else conn.errorStream
      val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      conn.disconnect()
      if (status !in 200..299 || raw.isBlank()) return@runCatching false
      val payload = JSONObject(raw)
      val active = payload.optBoolean("active", false)
      val trip = payload.optJSONObject("trip")
      val tripId = trip?.optString("id").orEmpty()
      val tripStatus = trip?.optString("status").orEmpty().lowercase()
      val live = active && tripId.isNotBlank() && tripStatus in LIVE_TRIP_STATUSES
      if (live) setActiveTripId(tripId)
      live
    }.getOrDefault(false)
  }

  private fun stopOnlineService() {
    isDriverServiceOnline = false
    persistWasOnline(false)
    stopAlertPlayback()
    rideAlertManager.goOffline()
    cancelAllDriverNotifications()
    stopLocationUpdates()
    handler.removeCallbacksAndMessages(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun extrasToOffer(intent: Intent): Map<String, String> {
    return mapOf(
      "tripId" to (intent.getStringExtra("tripId") ?: ""),
      "offerId" to (intent.getStringExtra("offerId") ?: ""),
      "riderName" to (intent.getStringExtra("riderName") ?: "Rider"),
      "pickup" to (intent.getStringExtra("pickup") ?: "Pickup location"),
      "dropoff" to (
        intent.getStringExtra("dropoff")
          ?: intent.getStringExtra("destination")
          ?: ""
      ),
      "fare" to (intent.getStringExtra("fare") ?: "--"),
      "eta" to (intent.getStringExtra("eta") ?: "--"),
      "distance" to (intent.getStringExtra("distance") ?: "--")
    )
  }

  companion object {
    private const val TAG = "NexrydeDriverFGS"
    const val ACTION_START = "com.nexryde.app.driver.START"
    const val ACTION_STOP = "com.nexryde.app.driver.STOP"
    const val ACTION_UPDATE_SESSION = "com.nexryde.app.driver.UPDATE_SESSION"
    const val ACTION_SET_ACTIVE_TRIP = "com.nexryde.app.driver.SET_ACTIVE_TRIP"
    const val ACTION_SHOW_OFFER = "com.nexryde.app.driver.SHOW_OFFER"
    const val ACTION_ACCEPT_OFFER = "com.nexryde.app.driver.ACCEPT_OFFER"
    const val ACTION_DECLINE_OFFER = "com.nexryde.app.driver.DECLINE_OFFER"
    const val ACTION_STOP_ALERT = "com.nexryde.app.driver.STOP_ALERT"
    const val EXTRA_DRIVER_ID = "driverId"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_REFRESH_TOKEN = "refreshToken"
    const val EXTRA_BACKEND_URL = "backendUrl"
    const val EXTRA_STATUS = "status"
    const val EXTRA_ACTIVE_TRIP_ID = "activeTripId"
    private const val CHANNEL_DRIVER_SERVICE = "driver_service"
    private const val CHANNEL_DRIVER_OFFERS = "driver_offers_v2"
    private const val NOTIFICATION_ID = 6101
    private const val OFFER_NOTIFICATION_ID = 6102
    private const val PENDING_OFFER_KEY = "pending_native_offer"
    /** Aligned with RT_HEARTBEAT_INTERVAL_SEC (20s) for Redis presence TTL freshness. */
    private const val HEARTBEAT_INTERVAL_MS = 20_000L
    /** Matches Expo BG task + JS idle push — rider pins must not wait on 60s heartbeat. */
    private const val LOCATION_UPLOAD_INTERVAL_MS = 10_000L
    private const val LOCATION_INTERVAL_MS = 10_000L
    private const val LOCATION_DISTANCE_M = 10f
    private const val PREFS_NAME = "nexryde_driver_fgs"
    private const val PREF_ACTIVE_TRIP_ID = "active_trip_id"
    private const val PREF_WAS_ONLINE = "was_online"

    /** Used by BootReceiver to restore listening after reboot if driver was online. */
    fun shouldRestoreAfterBoot(context: Context): Boolean {
      return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .getBoolean(PREF_WAS_ONLINE, false)
    }

    fun restoreAfterBoot(context: Context) {
      if (!shouldRestoreAfterBoot(context)) return
      val prefs = context.getSharedPreferences("nexryde_driver_native_session", Context.MODE_PRIVATE)
      val driverId = prefs.getString("driver_id", null)
      val token = prefs.getString("token", null)
      val backend = prefs.getString("backend_url", null)
      val refresh = prefs.getString("refresh_token", null)
      if (driverId.isNullOrBlank() || token.isNullOrBlank() || backend.isNullOrBlank()) {
        Log.w(TAG, "boot_restore_skipped_missing_session")
        return
      }
      Log.i(TAG, "boot_restore_fgs driver=$driverId")
      start(context, driverId, token, backend, refreshToken = refresh)
    }
    private val LIVE_TRIP_STATUSES = setOf("accepted", "arrived", "ongoing")
    @Volatile private var isDriverServiceOnline = false
    /** True only while the service instance exists — used to avoid startService(STOP) on cold login. */
    @Volatile private var serviceProcessAlive = false
    @Volatile private var companionActiveTripId: String? = null

    fun start(
      context: Context,
      driverId: String?,
      token: String?,
      backendUrl: String?,
      refreshToken: String? = null,
    ) {
      if (isDriverServiceOnline) {
        updateSession(context, token, backendUrl, refreshToken = refreshToken)
        return
      }
      val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
      val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
      if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
        Log.e(TAG, "skip_start_foreground_service_no_location")
        return
      }
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_DRIVER_ID, driverId)
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_BACKEND_URL, backendUrl)
        putExtra(EXTRA_REFRESH_TOKEN, refreshToken)
      }
      runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
        else context.startService(intent)
      }.onFailure { Log.e(TAG, "start_foreground_service_failed", it) }
    }

    fun stop(context: Context) {
      isDriverServiceOnline = false
      companionActiveTripId = null
      DriverOverlayBubbleController.hide()
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(OFFER_NOTIFICATION_ID)
      nm.cancel(NOTIFICATION_ID)
      // Offline login used to call stop() every mount → startService(STOP) → onCreate of a
      // brand-new service just to tear it down. Skip unless a process instance is alive.
      if (!serviceProcessAlive) {
        Log.i(TAG, "skip_stop_service_not_running")
        return
      }
      runCatching {
        context.startService(Intent(context, DriverForegroundService::class.java).apply { action = ACTION_STOP })
      }.onFailure { Log.e(TAG, "stop_service_failed", it) }
    }

    fun updateSession(
      context: Context,
      token: String?,
      backendUrl: String?,
      activeTripId: String? = null,
      refreshToken: String? = null,
    ) {
      if (!isDriverServiceOnline) return
      context.startService(Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_UPDATE_SESSION
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_BACKEND_URL, backendUrl)
        putExtra(EXTRA_REFRESH_TOKEN, refreshToken)
        if (activeTripId != null) putExtra(EXTRA_ACTIVE_TRIP_ID, activeTripId)
      })
    }

    fun setActiveTrip(context: Context, tripId: String?) {
      companionActiveTripId = tripId?.takeIf { it.isNotBlank() }
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_ACTIVE_TRIP_ID, companionActiveTripId)
        .apply()
      if (!serviceProcessAlive) return
      context.startService(Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_SET_ACTIVE_TRIP
        putExtra(EXTRA_ACTIVE_TRIP_ID, companionActiveTripId ?: "")
      })
    }

    fun showRideAlert(context: Context, offer: Map<String, String>) {
      if (!isDriverServiceOnline) {
        // FGS not promoted yet (go-online race). Persist so the offer is replayed the
        // instant the service comes online instead of dropping the ride.
        persistPendingOffer(context, offer)
        return
      }
      createChannels(context)
      // Already in a foreground session — use startService, not startForegroundService,
      // so we never re-enter the FGS start contract for offer UI.
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_SHOW_OFFER
        offer.forEach { (k, v) -> putExtra(k, v) }
      }
      runCatching { context.startService(intent) }
        .onFailure { Log.e(TAG, "show_ride_alert_start_failed", it) }
    }

    private fun persistPendingOffer(context: Context, offer: Map<String, String>) {
      runCatching {
        val json = JSONObject()
        offer.forEach { (k, v) -> json.put(k, v) }
        json.put("__ts", System.currentTimeMillis())
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
          .edit().putString(PENDING_OFFER_KEY, json.toString()).apply()
      }
    }

    fun stopRideAlert(context: Context) {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(OFFER_NOTIFICATION_ID)
      if (!isDriverServiceOnline) {
        DriverOverlayBubbleController.hide()
        return
      }
      runCatching {
        context.startService(Intent(context, DriverForegroundService::class.java).apply { action = ACTION_STOP_ALERT })
      }
    }

    fun acceptRideAlert(context: Context, offer: Map<String, String>) {
      if (!isDriverServiceOnline) return
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_ACCEPT_OFFER
        offer.forEach { (k, v) -> putExtra(k, v) }
      }
      runCatching { context.startService(intent) }
        .onFailure { Log.e(TAG, "accept_ride_alert_start_failed", it) }
    }

    fun declineRideAlert(context: Context, offer: Map<String, String>) {
      if (!isDriverServiceOnline) return
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_DECLINE_OFFER
        offer.forEach { (k, v) -> putExtra(k, v) }
      }
      runCatching { context.startService(intent) }
        .onFailure { Log.e(TAG, "decline_ride_alert_start_failed", it) }
    }

    fun createChannels(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val serviceChannel = NotificationChannel(
        CHANNEL_DRIVER_SERVICE,
        "Driver Online Service",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Keeps NEXRYDE driver online status active"
        setShowBadge(false)
      }
      val offerChannel = NotificationChannel(
        CHANNEL_DRIVER_OFFERS,
        "Ride Offers",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming NEXRYDE ride requests"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 700, 250, 700, 250, 900)
        setSound(null, null)
      }
      nm.createNotificationChannel(serviceChannel)
      nm.createNotificationChannel(offerChannel)
    }

    private fun pendingFlags(): Int {
      return PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    }
  }
}
