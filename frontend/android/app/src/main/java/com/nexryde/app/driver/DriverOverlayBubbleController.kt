package com.nexryde.app.driver

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.nexryde.app.R
import kotlin.math.abs

object DriverOverlayBubbleController {
  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var cardView: View? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var statusText: TextView? = null
  private var badgeText: TextView? = null
  private var currentOffer: Map<String, String> = emptyMap()

  fun hasPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
  }

  fun permissionIntent(context: Context): Intent {
    return Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${context.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  fun show(context: Context, status: String = "online", badge: Int = 0) {
    if (!hasPermission(context) || bubbleView != null) {
      update(status, badge)
      return
    }
    val appContext = context.applicationContext
    windowManager = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    val root = FrameLayout(appContext).apply {
      setPadding(dp(appContext, 4), dp(appContext, 4), dp(appContext, 4), dp(appContext, 4))
      background = appContext.getDrawable(R.drawable.nx_bubble_shadow)
    }
    val body = FrameLayout(appContext).apply {
      background = appContext.getDrawable(R.drawable.nx_bubble_bg)
      elevation = dp(appContext, 10).toFloat()
    }
    statusText = TextView(appContext).apply {
      text = initialsForStatus(status)
      setTextColor(Color.WHITE)
      textSize = 17f
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
    }
    badgeText = TextView(appContext).apply {
      text = if (badge > 0) badge.coerceAtMost(9).toString() else ""
      visibility = if (badge > 0) View.VISIBLE else View.GONE
      setTextColor(Color.rgb(2, 44, 34))
      setBackgroundColor(Color.rgb(34, 225, 128))
      textSize = 11f
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
    }
    body.addView(statusText, FrameLayout.LayoutParams(dp(appContext, 58), dp(appContext, 58), Gravity.CENTER))
    root.addView(body, FrameLayout.LayoutParams(dp(appContext, 66), dp(appContext, 66), Gravity.CENTER))
    root.addView(
      badgeText,
      FrameLayout.LayoutParams(dp(appContext, 22), dp(appContext, 22), Gravity.TOP or Gravity.END)
    )

    bubbleParams = WindowManager.LayoutParams(
      dp(appContext, 74),
      dp(appContext, 74),
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(appContext, 18)
      y = dp(appContext, 120)
    }

    installDragAndClick(root, appContext)
    bubbleView = root
    windowManager?.addView(root, bubbleParams)
    update(status, badge)
  }

  fun update(status: String = "online", badge: Int = 0, offer: Map<String, String> = emptyMap()) {
    if (offer.isNotEmpty()) currentOffer = offer
    statusText?.text = initialsForStatus(status)
    badgeText?.text = if (badge > 0) badge.coerceAtMost(9).toString() else ""
    badgeText?.visibility = if (badge > 0) View.VISIBLE else View.GONE
  }

  fun showOfferCard(context: Context, offer: Map<String, String>) {
    if (!hasPermission(context)) return
    currentOffer = offer
    show(context, "offer", 1)
    removeCard()

    val appContext = context.applicationContext
    val wm = windowManager ?: appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val card = LinearLayout(appContext).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(appContext, 18), dp(appContext, 16), dp(appContext, 18), dp(appContext, 16))
      setBackgroundColor(Color.rgb(6, 17, 34))
      elevation = dp(appContext, 16).toFloat()
    }
    fun label(text: String, size: Float, color: Int, bold: Boolean = false): TextView {
      return TextView(appContext).apply {
        this.text = text
        setTextColor(color)
        textSize = size
        if (bold) typeface = Typeface.DEFAULT_BOLD
      }
    }
    card.addView(label("NEW RIDE REQUEST", 12f, Color.rgb(34, 225, 128), true))
    card.addView(label(offer["riderName"] ?: "Rider", 20f, Color.WHITE, true))
    card.addView(label(offer["pickup"] ?: "Pickup location", 14f, Color.rgb(203, 213, 225)))
    card.addView(label("Fare: ${offer["fare"] ?: "--"}", 18f, Color.rgb(253, 230, 138), true))
    card.addView(label("ETA ${offer["eta"] ?: "--"} · ${offer["distance"] ?: "--"} away", 13f, Color.rgb(148, 163, 184)))
    card.addView(label("Respond before timer expires", 12f, Color.rgb(100, 116, 139)))

    val row = LinearLayout(appContext).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(appContext, 12), 0, 0)
    }
    val decline = actionButton(appContext, "DECLINE", Color.rgb(127, 29, 29), Color.WHITE) {
      DriverExperienceEvents.emit("decline_offer", mapOf("offerId" to offer["offerId"], "tripId" to offer["tripId"]))
      DriverForegroundService.stopRideAlert(appContext)
      removeCard()
    }
    val accept = actionButton(appContext, "ACCEPT", Color.rgb(34, 225, 128), Color.rgb(2, 44, 34)) {
      DriverExperienceEvents.emit("accept_offer", mapOf("offerId" to offer["offerId"], "tripId" to offer["tripId"]))
      DriverForegroundService.stopRideAlert(appContext)
      removeCard()
    }
    row.addView(decline, LinearLayout.LayoutParams(0, dp(appContext, 54), 1f).apply { marginEnd = dp(appContext, 8) })
    row.addView(accept, LinearLayout.LayoutParams(0, dp(appContext, 54), 1f).apply { marginStart = dp(appContext, 8) })
    card.addView(row)

    val params = WindowManager.LayoutParams(
      dp(appContext, 330),
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(appContext, 18)
      y = dp(appContext, 202)
    }
    cardView = card
    wm.addView(card, params)
  }

  fun hide() {
    removeCard()
    bubbleView?.let { view ->
      runCatching { windowManager?.removeView(view) }
    }
    bubbleView = null
    statusText = null
    badgeText = null
  }

  fun removeCard() {
    cardView?.let { view ->
      runCatching { windowManager?.removeView(view) }
    }
    cardView = null
  }

  private fun installDragAndClick(root: View, context: Context) {
    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f
    root.setOnTouchListener { _, event ->
      val params = bubbleParams ?: return@setOnTouchListener false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          startX = params.x
          startY = params.y
          touchX = event.rawX
          touchY = event.rawY
          true
        }
        MotionEvent.ACTION_MOVE -> {
          params.x = startX + (event.rawX - touchX).toInt()
          params.y = startY + (event.rawY - touchY).toInt()
          runCatching { windowManager?.updateViewLayout(root, params) }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (abs(event.rawX - touchX) < 10 && abs(event.rawY - touchY) < 10) {
            openApp(context)
          }
          true
        }
        else -> false
      }
    }
  }

  private fun openApp(context: Context) {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("nexryde://action/open_app"))
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    context.startActivity(intent)
  }

  private fun actionButton(context: Context, text: String, bg: Int, fg: Int, onClick: () -> Unit): TextView {
    return TextView(context).apply {
      this.text = text
      setTextColor(fg)
      setBackgroundColor(bg)
      textSize = 15f
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      setOnClickListener { onClick() }
    }
  }

  private fun initialsForStatus(status: String): String = when (status) {
    "offer" -> "!"
    "on_trip", "arrived" -> "GO"
    "offline" -> "OFF"
    else -> "NX"
  }

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun dp(context: Context, value: Int): Int =
    (value * context.resources.displayMetrics.density).toInt()
}
