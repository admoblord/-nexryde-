package com.nexryde.app.driver

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.nexryde.app.R

class DriverNotificationManager(private val context: Context) {
  private val appContext = context.applicationContext
  private val notificationManager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  init {
    createChannels()
  }

  fun buildPersistentNotification(status: String): Notification {
    val openApp = launchIntent("nexryde://action/open_app")
    val goOffline = launchIntent("nexryde://action/go_offline")
    val navigate = launchIntent("nexryde://action/open_app")
    val body =
      if (status.isBlank() || status.equals("Online", ignoreCase = true)) {
        "Listening for rides"
      } else {
        status
      }
    return NotificationCompat.Builder(appContext, CHANNEL_DRIVER_SERVICE)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("NEXRYDE • Listening for rides")
      .setContentText(body)
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

  fun updatePersistent(status: String) {
    notificationManager.notify(NOTIFICATION_ID, buildPersistentNotification(status))
  }

  fun showOfferNotification(offer: OverlayOffer) {
    val canUseFullScreen = canUseFullScreenIntent(appContext)
    val channelImportance = offerChannelImportance()
    Log.i(
      TAG,
      "show_offer_notification tripId=${offer.tripId} offerId=${offer.offerId} canUseFullScreen=$canUseFullScreen channelImportance=$channelImportance"
    )
    if (!canUseFullScreen) {
      Log.w(TAG, "Full-screen intent access is disabled; Android may show only a heads-up notification.")
      DriverExperienceEvents.emit(
        "native_full_screen_intent_blocked",
        mapOf("tripId" to offer.tripId, "offerId" to offer.offerId)
      )
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelImportance < NotificationManager.IMPORTANCE_HIGH) {
      Log.w(TAG, "Ride offer channel importance is below HIGH; full-screen notification may be suppressed.")
    }
    val fullScreenIntent = Intent(appContext, DriverRideAlertActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
      offer.toMap().forEach { (key, value) -> putExtra(key, value) }
    }
    val offerRequestCode = (offer.offerId.ifBlank { offer.tripId }.ifBlank { "nexryde-offer" }).hashCode()
    val pendingFullScreen = PendingIntent.getActivity(appContext, offerRequestCode, fullScreenIntent, pendingFlags())
    val launch = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("nexryde://action/open_app")).setPackage(appContext.packageName)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val openApp = PendingIntent.getActivity(appContext, OFFER_NOTIFICATION_ID + 1, launch, pendingFlags())
    val routeLine = if (offer.dropoff.isNotBlank()) {
      "${offer.pickup} → ${offer.dropoff}"
    } else {
      offer.pickup
    }
    val notification = NotificationCompat.Builder(appContext, CHANNEL_DRIVER_OFFERS)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("${offer.riderName} · ₦${offer.fare}")
      .setContentText(routeLine)
      .setStyle(
        NotificationCompat.BigTextStyle()
          .bigText("$routeLine\nETA ${offer.eta} · ${offer.distance} away")
      )
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVibrate(longArrayOf(0, 700, 250, 700, 250, 900))
      .setFullScreenIntent(pendingFullScreen, true)
      .setContentIntent(openApp)
      .setAutoCancel(false)
      .build()
    notificationManager.notify(OFFER_NOTIFICATION_ID, notification)
    // Do NOT startActivity here — FGS presentRideAlert owns the single launch.
    // Double-launch stacked two excludeFromRecents activities → finish one → launcher.
    // FSI PendingIntent above remains as the system heads-up / lock-screen path.
  }

  fun cancelOfferNotification() {
    notificationManager.cancel(OFFER_NOTIFICATION_ID)
  }

  private fun createChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
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
    notificationManager.createNotificationChannel(serviceChannel)
    notificationManager.createNotificationChannel(offerChannel)
    Log.i(TAG, "notification_channels_ready offerImportance=${offerChannel.importance}")
  }

  private fun offerChannelImportance(): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return NotificationManager.IMPORTANCE_HIGH
    return notificationManager.getNotificationChannel(CHANNEL_DRIVER_OFFERS)?.importance
      ?: NotificationManager.IMPORTANCE_NONE
  }

  private fun launchIntent(uri: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(appContext.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(appContext, uri.hashCode(), intent, pendingFlags())
  }

  private fun pendingFlags(): Int {
    return PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  }

  companion object {
    private const val TAG = "NexrydeFullScreen"
    const val NOTIFICATION_ID = 6101
    private const val OFFER_NOTIFICATION_ID = 6102
    private const val CHANNEL_DRIVER_SERVICE = "driver_service"
    private const val CHANNEL_DRIVER_OFFERS = "driver_offers_v2"

    fun canUseFullScreenIntent(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
      val manager = context.applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      return manager.canUseFullScreenIntent()
    }

    fun fullScreenIntentSettingsIntent(context: Context): Intent {
      val packageUri = Uri.parse("package:${context.applicationContext.packageName}")
      val action =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
        } else {
          Settings.ACTION_APPLICATION_DETAILS_SETTINGS
        }
      return Intent(action, packageUri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }
}
