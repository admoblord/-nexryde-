package com.nexryde.app.driver

import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class OverlayTouchController(
  private val context: Context,
  private val windowManager: WindowManager,
  private val paramsProvider: () -> WindowManager.LayoutParams?,
  private val rootProvider: () -> View?,
  private val isExpanded: () -> Boolean,
  private val onClick: () -> Unit,
  private val onCollapsedPositionChanged: (Int, Int) -> Unit,
  private val onExpandedPositionChanged: (Int, Int) -> Unit
) {
  private var snapAnimator: ValueAnimator? = null

  fun attachTo(view: View) {
    var startX = 0
    var startY = 0
    var touchX = 0f
    var touchY = 0f
    var dragging = false

    view.setOnTouchListener { _, event ->
      val params = paramsProvider() ?: return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snapAnimator?.cancel()
          startX = params.x
          startY = params.y
          touchX = event.rawX
          touchY = event.rawY
          dragging = false
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - touchX
          val dy = event.rawY - touchY
          if (!dragging && (abs(dx) > 8 || abs(dy) > 8)) dragging = true
          if (dragging) {
            params.x = startX + dx.toInt()
            params.y = startY + dy.toInt()
            rootProvider()?.let { root -> runCatching { windowManager.updateViewLayout(root, params) } }
          }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (!dragging) {
            onClick()
          } else {
            snapToEdge()
          }
          true
        }
        MotionEvent.ACTION_CANCEL -> {
          if (dragging) snapToEdge()
          true
        }
        else -> false
      }
    }
  }

  fun dispose() {
    snapAnimator?.cancel()
    snapAnimator = null
  }

  private fun snapToEdge() {
    val params = paramsProvider() ?: return
    val root = rootProvider() ?: return
    val metrics = context.resources.displayMetrics
    val width = params.width
    val height = params.height
    val margin = dp(10)
    val targetX = if (params.x + width / 2 < metrics.widthPixels / 2) margin else metrics.widthPixels - width - margin
    val minY = margin
    val maxY = max(minY, metrics.heightPixels - height - dp(56))
    val targetY = min(max(params.y, minY), maxY)
    val startX = params.x
    val startY = params.y
    snapAnimator?.cancel()
    snapAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 220
      interpolator = DecelerateInterpolator()
      addUpdateListener {
        val t = it.animatedValue as Float
        params.x = (startX + (targetX - startX) * t).toInt()
        params.y = (startY + (targetY - startY) * t).toInt()
        runCatching { windowManager.updateViewLayout(root, params) }
      }
      start()
    }
    if (isExpanded()) onExpandedPositionChanged(targetX, targetY) else onCollapsedPositionChanged(targetX, targetY)
  }

  private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()
}
