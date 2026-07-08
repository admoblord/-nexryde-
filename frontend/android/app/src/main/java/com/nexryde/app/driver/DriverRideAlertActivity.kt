package com.nexryde.app.driver

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.Window
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.graphics.Typeface

/**
 * Full-screen incoming ride surface. Android may show this only when the user
 * allows full-screen notifications for the app. It is intentionally native so it
 * can appear while React Native is backgrounded or the screen is locked.
 */
class DriverRideAlertActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
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
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    val tripId = intent.getStringExtra("tripId")
    val offerId = intent.getStringExtra("offerId")
    val riderName = intent.getStringExtra("riderName") ?: "Rider"
    val pickup = intent.getStringExtra("pickup") ?: "Pickup location"
    val fare = intent.getStringExtra("fare") ?: "--"
    val eta = intent.getStringExtra("eta") ?: "--"
    val distance = intent.getStringExtra("distance") ?: "--"

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
    root.addView(text("NEXRYDE", 13f, Color.rgb(34, 225, 128), true))
    root.addView(text("Incoming ride", 28f, Color.WHITE, true))
    root.addView(text(riderName, 22f, Color.rgb(226, 232, 240), true))
    root.addView(text(pickup, 16f, Color.rgb(148, 163, 184)))
    root.addView(text("₦$fare", 32f, Color.rgb(253, 230, 138), true))
    root.addView(text("ETA $eta · $distance away", 15f, Color.rgb(203, 213, 225)))

    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(28), 0, 0)
    }
    row.addView(button("DECLINE", Color.rgb(127, 29, 29), Color.WHITE) {
      DriverExperienceEvents.emit("decline_offer", mapOf("tripId" to tripId, "offerId" to offerId))
      DriverForegroundService.stopRideAlert(this)
      finish()
    }, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginEnd = dp(8) })
    row.addView(button("ACCEPT", Color.rgb(34, 225, 128), Color.rgb(2, 44, 34)) {
      DriverExperienceEvents.emit("accept_offer", mapOf("tripId" to tripId, "offerId" to offerId))
      DriverForegroundService.stopRideAlert(this)
      finish()
    }, LinearLayout.LayoutParams(0, dp(64), 1f).apply { marginStart = dp(8) })
    root.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    setContentView(root)
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
}
