package com.nexryde.app.driver

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.nexryde.app.R

/**
 * Ride-offer ringtone.
 *
 * A driver who does not hear the alert loses the trip, so this is built around
 * three rules: the player is prepared before the offer arrives (building and
 * preparing it on arrival cost audible seconds), the alarm stream is raised while
 * ringing (drivers had it turned down and heard nothing), and a decode failure
 * falls back to the system alarm tone instead of silence.
 */
class DriverAlertAudioManager(context: Context) {
  private val appContext = context.applicationContext
  private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var mediaPlayer: MediaPlayer? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var fallbackRingtone: Ringtone? = null
  private var previousAlarmVolume: Int? = null
  @Volatile private var preparing = false

  /**
   * Build and prepare the player ahead of time. Called when the shift starts so
   * the first offer rings immediately.
   */
  fun prewarm() {
    if (mediaPlayer != null || preparing) return
    preparing = true
    Thread {
      val prepared = runCatching { buildPreparedPlayer() }.getOrNull()
      synchronized(this) {
        if (mediaPlayer == null && prepared != null) {
          mediaPlayer = prepared
        } else {
          runCatching { prepared?.release() }
        }
        preparing = false
      }
    }.apply { isDaemon = true }.start()
  }

  fun start() {
    runCatching {
      requestAudioFocus()
      raiseAlarmVolume()
      val player = synchronized(this) { mediaPlayer } ?: runCatching { buildPreparedPlayer() }
        .onFailure { Log.e(TAG, "alert_player_build_failed", it) }
        .getOrNull()
      if (player == null) {
        startFallbackRingtone()
      } else {
        synchronized(this) { mediaPlayer = player }
        runCatching {
          if (player.isPlaying) {
            player.seekTo(0)
          } else {
            player.seekTo(0)
            player.start()
          }
        }.onFailure {
          Log.e(TAG, "alert_player_start_failed", it)
          releasePlayer()
          startFallbackRingtone()
        }
      }
    }.onFailure { Log.e(TAG, "alert_start_failed", it) }
    vibrate()
  }

  fun stop() {
    synchronized(this) {
      runCatching {
        mediaPlayer?.let { p ->
          if (p.isPlaying) p.pause()
          p.seekTo(0)
        }
      }.onFailure { releasePlayer() }
    }
    stopFallbackRingtone()
    restoreAlarmVolume()
    abandonAudioFocus()
    runCatching { vibrator().cancel() }
  }

  /** Full teardown — shift ended or service destroyed. */
  fun release() {
    stop()
    releasePlayer()
  }

  private fun releasePlayer() {
    synchronized(this) {
      runCatching {
        mediaPlayer?.reset()
        mediaPlayer?.release()
      }
      mediaPlayer = null
    }
  }

  private fun buildPreparedPlayer(): MediaPlayer {
    val afd = appContext.resources.openRawResourceFd(R.raw.nexryde_1)
      ?: throw IllegalStateException("missing nexryde_1 raw resource")
    try {
      return MediaPlayer().apply {
        setAudioAttributes(alertAudioAttributes())
        setWakeMode(appContext, PowerManager.PARTIAL_WAKE_LOCK)
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        isLooping = true
        setVolume(1.0f, 1.0f)
        setOnErrorListener { _, what, extra ->
          Log.e(TAG, "alert_player_error what=$what extra=$extra")
          releasePlayer()
          startFallbackRingtone()
          true
        }
        prepare()
      }
    } finally {
      runCatching { afd.close() }
    }
  }

  /** Silence is never acceptable for a ride offer — fall back to the system alarm. */
  private fun startFallbackRingtone() {
    runCatching {
      if (fallbackRingtone?.isPlaying == true) return
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: return
      val ringtone = RingtoneManager.getRingtone(appContext, uri) ?: return
      ringtone.audioAttributes = alertAudioAttributes()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.isLooping = true
      ringtone.play()
      fallbackRingtone = ringtone
      Log.w(TAG, "alert_fallback_ringtone_started")
    }.onFailure { Log.e(TAG, "alert_fallback_ringtone_failed", it) }
  }

  private fun stopFallbackRingtone() {
    runCatching { fallbackRingtone?.stop() }
    fallbackRingtone = null
  }

  /**
   * Raise the alarm stream for the duration of the alert. Restored in stop() so we
   * never permanently change the driver's device volume.
   */
  private fun raiseAlarmVolume() {
    runCatching {
      val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      if (max <= 0) return
      val current = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
      val target = (max * 0.85f).toInt().coerceIn(1, max)
      if (current >= target) return
      if (previousAlarmVolume == null) previousAlarmVolume = current
      audioManager.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
    }.onFailure { Log.w(TAG, "alarm_volume_raise_failed: ${it.message}") }
  }

  private fun restoreAlarmVolume() {
    val previous = previousAlarmVolume ?: return
    previousAlarmVolume = null
    runCatching { audioManager.setStreamVolume(AudioManager.STREAM_ALARM, previous, 0) }
  }

  private fun requestAudioFocus() {
    audioManager.mode = AudioManager.MODE_NORMAL
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setAudioAttributes(alertAudioAttributes())
        .setWillPauseWhenDucked(false)
        .setOnAudioFocusChangeListener { }
        .build()
      audioFocusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun abandonAudioFocus() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
      audioFocusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(null)
    }
  }

  private fun alertAudioAttributes(): AudioAttributes {
    return AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
  }

  private fun vibrate() {
    runCatching {
      val pattern = longArrayOf(0, 700, 250, 700, 250, 900)
      val vib = vibrator()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        vib.vibrate(pattern, 0)
      }
    }
  }

  private fun vibrator(): Vibrator {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
      manager.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      appContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
  }

  private companion object {
    const val TAG = "NexrydeDriverAudio"
  }
}
