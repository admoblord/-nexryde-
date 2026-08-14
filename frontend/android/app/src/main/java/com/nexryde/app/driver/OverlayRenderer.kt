package com.nexryde.app.driver

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.nexryde.app.R

class OverlayRenderer(
  private val context: Context,
  private val onAccept: () -> Unit,
  private val onDecline: () -> Unit
) {
  val root: FrameLayout = FrameLayout(context).apply {
    clipChildren = false
    clipToPadding = false
  }

  val circle: FrameLayout = FrameLayout(context).apply {
    background = circleDrawable(Color.rgb(8, 13, 25), dp(2), C_GREEN)
    elevation = dp(14).toFloat()
  }

  val card: LinearLayout = LinearLayout(context).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(18), dp(16), dp(18), dp(16))
    background = roundedRect(Color.rgb(6, 17, 34), dp(26).toFloat(), dp(1), Color.argb(120, 34, 225, 128))
    elevation = dp(18).toFloat()
    visibility = View.GONE
    alpha = 0f
    scaleX = 0.96f
    scaleY = 0.96f
  }

  private val logo = ImageView(context).apply {
    visibility = View.VISIBLE
    setImageResource(R.mipmap.ic_launcher_round)
    scaleType = ImageView.ScaleType.CENTER_CROP
    adjustViewBounds = true
    contentDescription = "nexryde driver logo"
  }
  private val statusBadge = View(context).apply {
    background = circleDrawable(C_GREEN, dp(2), Color.WHITE)
    elevation = dp(16).toFloat()
  }
  private val riderText = label("Rider", 21f, Color.WHITE, true)
  private val pickupText = label("Pickup location", 14f, Color.rgb(203, 213, 225), false)
  private val fareText = label("Fare --", 20f, Color.rgb(253, 230, 138), true)
  private val etaText = label("ETA -- · -- away", 13f, Color.rgb(148, 163, 184), false)
  private val countdownText = label("30s", 12f, Color.rgb(251, 191, 36), true).apply {
    gravity = Gravity.END
    includeFontPadding = false
  }
  private val acceptButton = actionButton("ACCEPT", Color.rgb(34, 225, 128), Color.rgb(2, 44, 34)) { onAccept() }
  private val declineButton = actionButton("DECLINE", Color.rgb(127, 29, 29), Color.WHITE) { onDecline() }
  /** Last colour actually applied, so a re-bind does not rebuild identical drawables. */
  private var appliedStatusColor: Int? = null

  init {
    val circleContent = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(3), dp(3), dp(3), dp(3))
      addView(logo, LinearLayout.LayoutParams(dp(58), dp(58)))
    }
    circle.addView(circleContent, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
      Gravity.CENTER
    ))
    circle.addView(statusBadge, FrameLayout.LayoutParams(dp(14), dp(14), Gravity.BOTTOM or Gravity.END).apply {
      rightMargin = dp(5)
      bottomMargin = dp(5)
    })
    root.addView(circle, FrameLayout.LayoutParams(dp(BUBBLE_DP), dp(BUBBLE_DP), Gravity.TOP or Gravity.START))

    val header = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    header.addView(label("nexryde", 12f, Color.rgb(34, 225, 128), true).apply { includeFontPadding = false }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    header.addView(countdownText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    card.addView(header)
    card.addView(riderText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
    card.addView(pickupText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(5) })
    card.addView(fareText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    card.addView(etaText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4) })
    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, dp(18), 0, 0)
    }
    row.addView(declineButton, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginEnd = dp(8) })
    row.addView(acceptButton, LinearLayout.LayoutParams(0, dp(56), 1f).apply { marginStart = dp(8) })
    card.addView(row)
    root.addView(card, FrameLayout.LayoutParams(dp(CARD_W_DP), dp(CARD_H_DP), Gravity.TOP or Gravity.START))
  }

  /**
   * bind() runs on every countdown tick. Rebuilding the background drawables and
   * re-setting unchanged text each second made the bubble visibly flicker, so
   * everything here is applied only when the value actually changed.
   */
  fun bind(state: OverlayState) {
    val color = statusColor(state.phase)
    if (appliedStatusColor != color) {
      appliedStatusColor = color
      statusBadge.background = circleDrawable(color, dp(2), Color.WHITE)
      circle.background = circleDrawable(Color.rgb(8, 13, 25), dp(2), color)
    }
    val offer = state.offer
    if (offer != null) {
      setTextIfChanged(riderText, offer.riderName)
      setTextIfChanged(pickupText, offer.pickup)
      setTextIfChanged(fareText, "Fare: ${offer.fare}")
      setTextIfChanged(etaText, "ETA ${offer.eta} · ${offer.distance} away")
    }
    setTextIfChanged(
      countdownText,
      when (state.phase) {
        OverlayPhase.ACCEPTING -> state.message ?: "Securing ride..."
        OverlayPhase.DECLINING -> state.message ?: "Closing request..."
        OverlayPhase.OFFER -> state.message ?: "${state.countdownSeconds.coerceAtLeast(0)}s"
        else -> "${state.countdownSeconds.coerceAtLeast(0)}s"
      },
    )
    setButtonsEnabled(state.phase != OverlayPhase.ACCEPTING && state.phase != OverlayPhase.DECLINING)
    setTextIfChanged(acceptButton, if (state.phase == OverlayPhase.ACCEPTING) "ACCEPTING..." else "ACCEPT")
    setTextIfChanged(declineButton, if (state.phase == OverlayPhase.DECLINING) "DECLINING..." else "DECLINE")
  }

  private fun setTextIfChanged(view: TextView, next: String) {
    if (view.text?.toString() == next) return
    view.text = next
  }

  fun expand() {
    card.visibility = View.VISIBLE
    circle.animate().x(dp(12).toFloat()).y(dp(12).toFloat()).setDuration(180).start()
    card.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(DecelerateInterpolator()).start()
  }

  fun collapse() {
    card.animate().alpha(0f).scaleX(0.96f).scaleY(0.96f).setDuration(140).withEndAction {
      card.visibility = View.GONE
    }.start()
    circle.animate().x(0f).y(0f).setDuration(160).start()
  }

  fun destroy() {
    root.animate().cancel()
    circle.animate().cancel()
    card.animate().cancel()
    circle.scaleX = 1f
    circle.scaleY = 1f
  }

  private fun setButtonsEnabled(enabled: Boolean) {
    if (acceptButton.isEnabled == enabled) return
    acceptButton.isEnabled = enabled
    declineButton.isEnabled = enabled
    acceptButton.alpha = if (enabled) 1f else 0.74f
    declineButton.alpha = if (enabled) 1f else 0.74f
  }

  private fun actionButton(text: String, bg: Int, fg: Int, onClick: () -> Unit): TextView {
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

  private fun label(text: String, size: Float, color: Int, bold: Boolean): TextView {
    return TextView(context).apply {
      this.text = text
      setTextColor(color)
      textSize = size
      if (bold) typeface = Typeface.DEFAULT_BOLD
    }
  }

  private fun statusColor(phase: OverlayPhase): Int = when (phase) {
    OverlayPhase.OFFER -> C_RED
    OverlayPhase.COUNTDOWN -> C_ORANGE
    OverlayPhase.ACCEPTING, OverlayPhase.DECLINING -> C_ORANGE
    OverlayPhase.ON_TRIP -> C_BLUE
    else -> C_GREEN
  }

  private fun circleDrawable(color: Int, strokeWidth: Int, strokeColor: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(color)
      setStroke(strokeWidth, strokeColor)
    }
  }

  private fun roundedRect(color: Int, radius: Float, strokeWidth: Int, strokeColor: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      setColor(color)
      cornerRadius = radius
      setStroke(strokeWidth, strokeColor)
    }
  }

  private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

  companion object {
    const val BUBBLE_DP = 68
    const val CARD_W_DP = 330
    const val CARD_H_DP = 286
    private const val C_GREEN = 0xFF16A34A.toInt()
    private const val C_RED = 0xFFDC2626.toInt()
    private const val C_ORANGE = 0xFFF97316.toInt()
    private const val C_BLUE = 0xFF2563EB.toInt()
  }
}
