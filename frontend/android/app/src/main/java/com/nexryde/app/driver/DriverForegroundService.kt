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
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.nexryde.app.R
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Android-supported online-driver foreground service.
 *
 * It intentionally keeps business decisions in JS/backend. Native owns only
 * platform responsibilities that React Native cannot reliably perform while
 * backgrounded: foreground service, Android notification, location callbacks,
 * loud alert audio/vibration, full-screen intent, and overlay bubble.
 */
class DriverForegroundService : Service(), LocationListener {
  private val handler = Handler(Looper.getMainLooper())
  private var locationManager: LocationManager? = null
  private var lastLocation: Location? = null
  private var token: String? = null
  private var backendUrl: String? = null
  private var driverId: String? = null
  private var mediaPlayer: MediaPlayer? = null
  private var rideStatus: String = "Online"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannels(this)
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopOnlineService()
        return START_NOT_STICKY
      }
      ACTION_UPDATE_SESSION -> {
        token = intent.getStringExtra(EXTRA_TOKEN) ?: token
        backendUrl = intent.getStringExtra(EXTRA_BACKEND_URL) ?: backendUrl
        updatePersistentNotification()
        return START_STICKY
      }
      ACTION_SHOW_OFFER -> {
        token = intent.getStringExtra(EXTRA_TOKEN) ?: token
        backendUrl = intent.getStringExtra(EXTRA_BACKEND_URL) ?: backendUrl
        startForeground(NOTIFICATION_ID, buildPersistentNotification())
        presentRideAlert(extrasToOffer(intent))
        return START_STICKY
      }
      ACTION_STOP_ALERT -> {
        stopAlertPlayback()
        DriverOverlayBubbleController.removeCard()
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(OFFER_NOTIFICATION_ID)
        return START_STICKY
      }
      else -> {
        driverId = intent?.getStringExtra(EXTRA_DRIVER_ID) ?: driverId
        token = intent?.getStringExtra(EXTRA_TOKEN) ?: token
        backendUrl = intent?.getStringExtra(EXTRA_BACKEND_URL) ?: backendUrl
        rideStatus = intent?.getStringExtra(EXTRA_STATUS) ?: "Online"
        startForeground(NOTIFICATION_ID, buildPersistentNotification())
        startLocationUpdates()
        scheduleHeartbeat()
        DriverOverlayBubbleController.show(this, "online", 0)
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    stopLocationUpdates()
    handler.removeCallbacksAndMessages(null)
    stopAlertPlayback()
    DriverOverlayBubbleController.hide()
    super.onDestroy()
  }

  override fun onLocationChanged(location: Location) {
    lastLocation = location
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

  private val heartbeatRunnable = object : Runnable {
    override fun run() {
      sendHeartbeat()
      handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
    }
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
        conn.inputStream.close()
        conn.disconnect()
      }
    }.start()
  }

  private fun updatePersistentNotification() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIFICATION_ID, buildPersistentNotification())
  }

  private fun buildPersistentNotification(): Notification {
    val openApp = launchIntent("nexryde://action/open_app")
    val goOffline = launchIntent("nexryde://action/go_offline")
    val navigate = launchIntent("nexryde://action/open_app")
    return NotificationCompat.Builder(this, CHANNEL_DRIVER_SERVICE)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("NexRyde Driver Online")
      .setContentText(rideStatus)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(openApp)
      .addAction(android.R.drawable.ic_menu_view, "Open App", openApp)
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Go Offline", goOffline)
      .addAction(android.R.drawable.ic_dialog_map, "Navigate", navigate)
      .build()
  }

  private fun presentRideAlert(offer: Map<String, String>) {
    rideStatus = "New ride request"
    updatePersistentNotification()
    startAlertPlayback()
    DriverOverlayBubbleController.showOfferCard(this, offer)

    val fullScreenIntent = Intent(this, DriverRideAlertActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      offer.forEach { (k, v) -> putExtra(k, v) }
    }
    val pendingFullScreen = PendingIntent.getActivity(this, OFFER_NOTIFICATION_ID, fullScreenIntent, pendingFlags())
    val launch = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("nexryde://action/open_app")).setPackage(packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val openApp = PendingIntent.getActivity(this, OFFER_NOTIFICATION_ID + 1, launch, pendingFlags())
    val soundUri = Uri.parse("android.resource://$packageName/${R.raw.nexryde_1}")
    val notification = NotificationCompat.Builder(this, CHANNEL_DRIVER_OFFERS)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("New NexRyde ride request")
      .setContentText("${offer["pickup"] ?: "Pickup"} · ${offer["fare"] ?: "--"}")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setSound(soundUri)
      .setVibrate(longArrayOf(0, 700, 250, 700, 250, 900))
      .setFullScreenIntent(pendingFullScreen, true)
      .setContentIntent(openApp)
      .setAutoCancel(false)
      .build()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(OFFER_NOTIFICATION_ID, notification)
  }

  private fun launchIntent(uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(this, uri.hashCode(), intent, pendingFlags())
  }

  private fun startAlertPlayback() {
    stopAlertPlayback()
    mediaPlayer = MediaPlayer.create(this, R.raw.nexryde_1)?.apply {
      isLooping = true
      setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      start()
    }
    vibrateAlert()
  }

  private fun stopAlertPlayback() {
    runCatching {
      mediaPlayer?.stop()
      mediaPlayer?.release()
    }
    mediaPlayer = null
    runCatching { vibrator().cancel() }
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

  private fun stopOnlineService() {
    stopAlertPlayback()
    DriverOverlayBubbleController.hide()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(OFFER_NOTIFICATION_ID)
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
      "fare" to (intent.getStringExtra("fare") ?: "--"),
      "eta" to (intent.getStringExtra("eta") ?: "--"),
      "distance" to (intent.getStringExtra("distance") ?: "--")
    )
  }

  companion object {
    const val ACTION_START = "com.nexryde.app.driver.START"
    const val ACTION_STOP = "com.nexryde.app.driver.STOP"
    const val ACTION_UPDATE_SESSION = "com.nexryde.app.driver.UPDATE_SESSION"
    const val ACTION_SHOW_OFFER = "com.nexryde.app.driver.SHOW_OFFER"
    const val ACTION_STOP_ALERT = "com.nexryde.app.driver.STOP_ALERT"
    const val EXTRA_DRIVER_ID = "driverId"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BACKEND_URL = "backendUrl"
    const val EXTRA_STATUS = "status"
    private const val CHANNEL_DRIVER_SERVICE = "driver_service"
    private const val CHANNEL_DRIVER_OFFERS = "driver_offers"
    private const val NOTIFICATION_ID = 6101
    private const val OFFER_NOTIFICATION_ID = 6102
    private const val HEARTBEAT_INTERVAL_MS = 60_000L
    private const val LOCATION_INTERVAL_MS = 10_000L
    private const val LOCATION_DISTANCE_M = 10f

    fun start(context: Context, driverId: String?, token: String?, backendUrl: String?) {
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_DRIVER_ID, driverId)
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_BACKEND_URL, backendUrl)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stop(context: Context) {
      context.startService(Intent(context, DriverForegroundService::class.java).apply { action = ACTION_STOP })
    }

    fun updateSession(context: Context, token: String?, backendUrl: String?) {
      context.startService(Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_UPDATE_SESSION
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_BACKEND_URL, backendUrl)
      })
    }

    fun showRideAlert(context: Context, offer: Map<String, String>) {
      createChannels(context)
      val intent = Intent(context, DriverForegroundService::class.java).apply {
        action = ACTION_SHOW_OFFER
        offer.forEach { (k, v) -> putExtra(k, v) }
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    fun stopRideAlert(context: Context) {
      DriverOverlayBubbleController.removeCard()
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(OFFER_NOTIFICATION_ID)
      runCatching {
        context.startService(Intent(context, DriverForegroundService::class.java).apply { action = ACTION_STOP_ALERT })
      }
    }

    fun createChannels(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val serviceChannel = NotificationChannel(
        CHANNEL_DRIVER_SERVICE,
        "Driver Online Service",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Keeps NexRyde driver online status active"
        setShowBadge(false)
      }
      val soundUri = Uri.parse("android.resource://${context.packageName}/${R.raw.nexryde_1}")
      val offerChannel = NotificationChannel(
        CHANNEL_DRIVER_OFFERS,
        "Ride Offers",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {
        description = "Incoming NexRyde ride requests"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 700, 250, 700, 250, 900)
        setSound(
          soundUri,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
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
