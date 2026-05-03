package com.nexryde.app.floating

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.nexryde.app.MainActivity
import com.nexryde.app.R

/**
 * Floating driver status bubble — a draggable system-overlay window that stays
 * visible above all other apps when Nexryde is minimised.
 *
 * Tap  → brings Nexryde back to the foreground.
 * Long → dismisses the bubble.
 * Drag → repositions freely on screen.
 */
class FloatingDriverService : Service() {

    companion object {
        const val CHANNEL_ID  = "nx_floating_driver"
        const val NOTIF_ID    = 2001

        const val EXTRA_STATUS    = "nx_status"
        const val EXTRA_TRIP_INFO = "nx_trip_info"

        // Shared state read by the JS bridge without IPC
        @Volatile var isRunning = false
        @Volatile var currentStatus = "online"
    }

    private var wm: WindowManager? = null
    private var rootView: View?     = null
    private var lp: WindowManager.LayoutParams? = null

    // Touch-drag bookkeeping
    private var initX = 0;  private var initY = 0
    private var touchX = 0f; private var touchY = 0f
    private var dragging = false

    // ──────────────────────────────────────────────────────────────────────────
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createChannel()
        startForeground(NOTIF_ID, buildNotification())
        inflateBubble()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val status   = intent?.getStringExtra(EXTRA_STATUS)   ?: return START_STICKY
        val tripInfo = intent.getStringExtra(EXTRA_TRIP_INFO)
        currentStatus = status
        applyStatus(status, tripInfo)
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        rootView?.let { v -> try { wm?.removeView(v) } catch (_: Exception) {} }
        rootView = null
        super.onDestroy()
    }

    // ── Notification ──────────────────────────────────────────────────────────
    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel(CHANNEL_ID, "Driver Bubble", NotificationManager.IMPORTANCE_LOW)
                .apply {
                    description = "Nexryde driver status bubble"
                    setShowBadge(false)
                    enableLights(false)
                    enableVibration(false)
                }.also {
                    getSystemService(NotificationManager::class.java)?.createNotificationChannel(it)
                }
        }
    }

    private fun buildNotification(): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val pi = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Nexryde — Driver Active")
            .setContentText("Tap to open Nexryde")
            .setContentIntent(pi)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    // ── Bubble view ───────────────────────────────────────────────────────────
    private fun inflateBubble() {
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val inflater = LayoutInflater.from(this)
        rootView = inflater.inflate(R.layout.floating_driver_bubble, null)

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 24; y = 220
        }

        rootView?.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initX = lp!!.x;   initY = lp!!.y
                    touchX = event.rawX; touchY = event.rawY
                    dragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - touchX).toInt()
                    val dy = (event.rawY - touchY).toInt()
                    if (!dragging && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) dragging = true
                    if (dragging) {
                        lp!!.x = initX + dx
                        lp!!.y = initY + dy
                        try { wm?.updateViewLayout(rootView, lp) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragging) {
                        // Single tap → bring Nexryde to foreground
                        startActivity(
                            Intent(this, MainActivity::class.java).apply {
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
                            }
                        )
                    }
                    view.performClick()
                    true
                }
                else -> false
            }
        }

        rootView?.setOnLongClickListener {
            // Long press → dismiss bubble
            stopSelf()
            true
        }

        try { wm?.addView(rootView, lp) } catch (e: Exception) { e.printStackTrace() }
    }

    // ── Status update ─────────────────────────────────────────────────────────
    private fun applyStatus(status: String, tripInfo: String?) {
        val view = rootView ?: return
        val dot    = view.findViewById<View>(R.id.bubbleStatusDot)
        val label  = view.findViewById<TextView>(R.id.bubbleLabel)

        when (status) {
            "online"  -> {
                dot?.setBackgroundResource(R.drawable.nx_dot_green)
                label?.text = "Online"
                label?.setTextColor(0xFF00D46A.toInt())
            }
            "offline" -> {
                dot?.setBackgroundResource(R.drawable.nx_dot_grey)
                label?.text = "Offline"
                label?.setTextColor(0xFF94A3B8.toInt())
            }
            "on_trip" -> {
                dot?.setBackgroundResource(R.drawable.nx_dot_blue)
                label?.text = if (!tripInfo.isNullOrBlank()) tripInfo else "On Trip"
                label?.setTextColor(0xFF60A5FA.toInt())
            }
            "arrived" -> {
                dot?.setBackgroundResource(R.drawable.nx_dot_yellow)
                label?.text = "Arrived"
                label?.setTextColor(0xFFFBBF24.toInt())
            }
        }
    }
}
