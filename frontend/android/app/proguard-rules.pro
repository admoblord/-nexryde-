# NexRyde release (R8) rules — required when android.enableMinifyInReleaseBuilds=true.
# Build 166 worked without minify; build 167+ crashed ~2s after splash because R8
# stripped React Native / Expo / Maps / Widget / Sentry classes with only 2 keep rules.

# ── React Native core ────────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.defaults.** { *; }
-keep class com.facebook.react.fabric.** { *; }

-keep @com.facebook.react.bridge.ReactMethod class *
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp *; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup *; }

# ── Expo modules ─────────────────────────────────────────────────────────────
-keep class expo.modules.** { *; }
-keepclassmembers class * { @expo.modules.core.interfaces.DoNotStrip *; }
-keepnames class * extends expo.modules.core.BasePackage
-keepnames class * implements expo.modules.core.interfaces.Package

# ── App + home-screen widget ─────────────────────────────────────────────────
-keep class com.nexryde.app.** { *; }
-keep class com.reactnativeandroidwidget.** { *; }

# ── Reanimated / Worklets ────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ── Maps + Navigation SDK (react-native-maps is wired to Nav SDK maps) ────────
# Without these, R8 strips Nav classes → SIGSEGV / UnsatisfiedLinkError when
# driver offline MapView mounts right after sign-in (rider may not hit same path).
-keep class com.google.android.gms.maps.** { *; }
-keep class com.google.android.libraries.maps.** { *; }
-keep class com.google.android.libraries.navigation.** { *; }
-keep class com.google.android.libraries.mapsplatform.** { *; }
-keep class com.google.android.react.navsdk.** { *; }
-keep class com.google.maps.android.** { *; }
-keep class com.rnmaps.maps.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.android.libraries.navigation.**
-dontwarn com.google.android.react.navsdk.**

# ── Sentry (native plugin may init even when JS DSN is empty) ─────────────────
-keepattributes LineNumberTable,SourceFile
-renamesourcefileattribute SourceFile
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**

# ── Background location / task manager ───────────────────────────────────────
-keep class expo.modules.taskManager.** { *; }
-keep class expo.modules.location.** { *; }

# ── Networking ───────────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# ── Kotlin metadata (reflection used by some native bridges) ─────────────────
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
