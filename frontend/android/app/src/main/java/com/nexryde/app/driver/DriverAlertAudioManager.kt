package com.nexryde.app.driver

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.nexryde.app.R

class DriverAlertAudioManager(private val context: Context) {
  private val appContext = context.applicationContext
  private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var mediaPlayer: MediaPlayer? = null
  private var audioFocusRequest: AudioFocusRequest? = null

  fun start() {
    stop()
    runCatching {
      requestAudioFocus()
      val afd = appContext.resources.openRawResourceFd(R.raw.nexryde_1) ?: return@runCatching
      try {
        mediaPlayer = MediaPlayer().apply {
          setAudioAttributes(alertAudioAttributes())
          setWakeMode(appContext, PowerManager.PARTIAL_WAKE_LOCK)
          setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
          isLooping = true
          setVolume(1.0f, 1.0f)
          prepare()
          start()
        }
      } finally {
        afd.close()
      }
    }
    vibrate()
  }

  fun stop() {
    runCatching {
      mediaPlayer?.stop()
      mediaPlayer?.release()
    }
    mediaPlayer = null
    abandonAudioFocus()
    runCatching { vibrator().cancel() }
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
    val pattern = longArrayOf(0, 700, 250, 700, 250, 900)
    val vib = vibrator()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
    } else {
      @Suppress("DEPRECATION")
      vib.vibrate(pattern, 0)
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
}
