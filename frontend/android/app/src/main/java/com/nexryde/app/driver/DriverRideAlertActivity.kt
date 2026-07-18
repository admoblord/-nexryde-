package com.nexryde.app.driver

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.graphics.Typeface
import android.util.Log

/**
 * Full-screen incoming ride surface. Android may show this only when the user
 * allows full-screen notifications for the app. It is intentionally native so it
 * can appear while React Native is backgrounded or the screen is locked.
 */
class DriverRideAlertActivity : Activity() {
  private var tripId: String = ""
  private var offerId: String = ""
  private var statusText: TextView? = null
  private var acceptButtonView: TextView? = null
  private var declineButtonView: TextView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Log.i(TAG, "activity_on_create")
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    activeActivity = this
    setFinishOnTouchOutside(false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
    }
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility =
      View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

    bindIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    Log.i(TAG, "activity_on_new_intent")
    if (intent != null) {
      setIntent(intent)
      bindIntent(intent)
    }
  }

  override fun onBackPressed() {
    Log.i(TAG, "activity_back_ignored tripId=$tripId offerId=$offerId")
    // Incoming ride must stay up until the driver accepts, declines, or it expires.
  }

  override fun onDestroy() {
    Log.i(TAG, "activity_on_destroy tripId=$tripId offerId=$offerId")
    if (activeActivity === this) {
      activeActivity = null
    }
    super.onDestroy()
  }

  private fun bindIntent(intent: Intent) {
    tripId = intent.getStringExtra("tripId").orEmpty()
    offerId = intent.getStringExtra("offerId").orEmpty()
    Log.i(TAG, "activity_bind_intent tripId=$tripId offerId=$offerId")
    val riderName = intent.getStringExtra("riderName") ?: "Rider"
    val pickup = intent.getStringExtra("pickup") ?: "Pickup location"
    val fare = intent.getStringExtra("fare") ?: "--"
    val eta = intent.getStringExtra("eta") ?: "--"
    val distance = intent.getStringExtra("distance") ?: "--"
    val offerPayload = mapOf(
      "tripId" to tripId,
      "offerId" to offerId,
      "riderName" to riderName,
      "pickup" to pickup,
      "fare" to fare,
      "eta" to eta,
      "distance" to distance
    )

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(32), dp(24), dp(32))
      setBackgroundColor(Color.rgb(5, 12, 24))
    }
    fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView {
      return TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER
        if (bold) typeface = Typeface.DEFAULT_BOLD
      }
    }
    root.addView(text("nexryde", 13f, Color.rgb(34, 225, 128), true))
    root.addView(text("Incoming ride", 28f, Color.WHITE, true))
    root.addView(text(riderName, 22f, Color.rgb(226, 232, 240), true))
    root.addView(text(pickup, 16f, Color.rgb(148, 163, 184)))
    root.addView(text("₦$fare", 32f, Color.rgb(253, 230, 138), true))
    root.addView(text("ETA $eta · $distance away", 15f, Color.rgb(203, 213, 225)))
    statusText = text("Waiting for your response", 14f, Color.rgb(203, 213, 225), true).also {
      root.addView(it)
    }

    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(28), 0, 0)
    }
    declineButtonView = button("DECLINE", Color.rgb(127, 29, 29), Color.WHITE) {
      Log.i(TAG, "activity_decline_tap tripId=$tripId offerId=$offerId")
      DriverForegroundService.declineRideAlert(this, offerPayload)
    }
    row.addView(declineButtonView, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginEnd = dp(8) })
    acceptButtonView = button("ACCEPT", Color.rgb(34, 225, 128), Color.rgb(2, 44, 34)) {
      Log.i(TAG, "activity_accept_tap tripId=$tripId offerId=$offerId")
      DriverForegroundService.acceptRideAlert(this, offerPayload)
    }
    row.addView(acceptButtonView, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginStart = dp(8) })
    root.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    setContentView(root)
  }

  private fun setActionBusy(busy: Boolean, message: String, error: Boolean = false) {
    statusText?.text = message
    statusText?.setTextColor(if (error) Color.rgb(252, 165, 165) else Color.rgb(253, 230, 138))
    acceptButtonView?.isEnabled = !busy
    declineButtonView?.isEnabled = !busy
    acceptButtonView?.alpha = if (busy) 0.68f else 1f
    declineButtonView?.alpha = if (busy) 0.68f else 1f
  }

  private fun button(label: String, bg: Int, fg: Int, onClick: () -> Unit): TextView {
    return TextView(this).apply {
      text = label
      textSize = 18f
      setTextColor(fg)
      setBackgroundColor(bg)
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      setOnClickListener { onClick() }
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  companion object {
    private const val TAG = "NexrydeFullScreen"
    @Volatile private var activeActivity: DriverRideAlertActivity? = null

    fun finishActiveAlert(tripId: String? = null, offerId: String? = null) {
      val activity = activeActivity ?: return
      val matchesTrip = tripId.isNullOrBlank() || activity.tripId == tripId
      val matchesOffer = offerId.isNullOrBlank() || activity.offerId == offerId
      if (matchesTrip && matchesOffer) {
        Log.i(TAG, "activity_finish_active tripId=${activity.tripId} offerId=${activity.offerId}")
        activity.runOnUiThread { activity.finish() }
      }
    }

    fun hasActiveAlert(tripId: String? = null, offerId: String? = null): Boolean {
      val activity = activeActivity ?: return false
      val matchesTrip = tripId.isNullOrBlank() || activity.tripId == tripId
      val matchesOffer = offerId.isNullOrBlank() || activity.offerId == offerId
      return matchesTrip && matchesOffer
    }

    fun markActionBusy(tripId: String?, offerId: String?, message: String) {
      val activity = activeActivity ?: return
      if (!hasActiveAlert(tripId, offerId)) return
      activity.runOnUiThread { activity.setActionBusy(true, message) }
    }

    fun markActionRetryable(tripId: String?, offerId: String?, message: String) {
      val activity = activeActivity ?: return
      if (!hasActiveAlert(tripId, offerId)) return
      activity.runOnUiThread { activity.setActionBusy(false, message, error = true) }
    }
  }
}
