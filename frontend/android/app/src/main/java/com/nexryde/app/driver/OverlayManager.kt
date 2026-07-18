package com.nexryde.app.driver

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager

class OverlayManager(
  context: Context,
  private val stateManager: OverlayStateManager,
  private val onAccept: () -> Unit,
  private val onDecline: () -> Unit
) {
  private val appContext = context.applicationContext
  private val windowManager = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var renderer: OverlayRenderer? = null
  private var touchController: OverlayTouchController? = null
  private var params: WindowManager.LayoutParams? = null
  private var expanded = false
  private var collapsedX: Int? = null
  private var collapsedY: Int? = null

  fun hasPermission(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(appContext)
  }

  fun permissionIntent(): Intent {
    return Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${appContext.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  fun render(next: OverlayState) {
    if (next.phase == OverlayPhase.HIDDEN) {
      hide()
      return
    }
    if (!hasPermission()) return
    ensureOverlay()
    val r = renderer ?: return
    r.bind(next)
    if (next.isExpanded) expand() else collapse()
  }

  fun hide() {
    touchController?.dispose()
    touchController = null
    renderer?.destroy()
    renderer?.root?.let { root -> runCatching { windowManager.removeView(root) } }
    renderer = null
    params = null
    expanded = false
    collapsedX = null
    collapsedY = null
  }

  private fun ensureOverlay() {
    if (renderer != null) return
    val r = OverlayRenderer(appContext, onAccept, onDecline)
    renderer = r
    val saved = loadPosition()
    params = WindowManager.LayoutParams(
      dp(OverlayRenderer.BUBBLE_DP),
      dp(OverlayRenderer.BUBBLE_DP),
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = saved.first
      y = saved.second
    }
    touchController = OverlayTouchController(
      appContext,
      windowManager,
      paramsProvider = { params },
      rootProvider = { renderer?.root },
      isExpanded = { expanded },
      onClick = { openApp() },
      onCollapsedPositionChanged = { x, y -> savePosition(x, y) },
      onExpandedPositionChanged = { x, y ->
        collapsedX = x
        collapsedY = y
      }
    ).also { it.attachTo(r.circle) }
    windowManager.addView(r.root, params)
  }

  private fun expand() {
    if (expanded) return
    val p = params ?: return
    val root = renderer?.root ?: return
    val metrics = appContext.resources.displayMetrics
    collapsedX = p.x
    collapsedY = p.y
    p.width = dp(OverlayRenderer.CARD_W_DP)
    p.height = dp(OverlayRenderer.CARD_H_DP)
    p.x = p.x.coerceIn(dp(8), metrics.widthPixels - p.width - dp(8))
    p.y = p.y.coerceIn(dp(24), metrics.heightPixels - p.height - dp(24))
    windowManager.updateViewLayout(root, p)
    renderer?.expand()
    expanded = true
  }

  private fun collapse() {
    if (!expanded) return
    val p = params ?: return
    val root = renderer?.root ?: return
    renderer?.collapse()
    p.width = dp(OverlayRenderer.BUBBLE_DP)
    p.height = dp(OverlayRenderer.BUBBLE_DP)
    collapsedX?.let { p.x = it }
    collapsedY?.let { p.y = it }
    savePosition(p.x, p.y)
    windowManager.updateViewLayout(root, p)
    collapsedX = null
    collapsedY = null
    expanded = false
  }

  private fun openApp() {
    val intent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("nexryde://action/open_app"))
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    appContext.startActivity(intent)
  }

  private fun loadPosition(): Pair<Int, Int> {
    val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val metrics = appContext.resources.displayMetrics
    val bubble = dp(OverlayRenderer.BUBBLE_DP)
    val margin = dp(10)
    return Pair(
      prefs.getInt(POS_X, metrics.widthPixels - bubble - margin),
      prefs.getInt(POS_Y, dp(82))
    )
  }

  private fun savePosition(x: Int, y: Int) {
    appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putInt(POS_X, x)
      .putInt(POS_Y, y)
      .apply()
  }

  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  private fun dp(value: Int): Int = (value * appContext.resources.displayMetrics.density).toInt()

  companion object {
    private const val PREFS = "nexryde_driver_overlay"
    private const val POS_X = "x"
    private const val POS_Y = "y"
  }
}
