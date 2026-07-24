package com.nexryde.app.driver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * After reboot, restore driver FGS listening when the last session was online.
 * Relies on persisted session + was_online flag — no silent drop of availability.
 */
class DriverBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_LOCKED_BOOT_COMPLETED &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }
    Log.i(TAG, "boot_event action=$action")
    runCatching { DriverForegroundService.restoreAfterBoot(context.applicationContext) }
      .onFailure { Log.e(TAG, "boot_restore_failed", it) }
  }

  companion object {
    private const val TAG = "NexrydeDriverBoot"
  }
}
