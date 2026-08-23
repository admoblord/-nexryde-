package com.nexryde.app

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Inet4Address
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.OkHttpClient

/**
 * Every fetch() in the app goes through this client.
 *
 * React Native's own builder documents "No timeouts by default" and sets connect,
 * read and write to 0 — unlimited. Our Cloud Run host resolves to eight IPv4 and
 * eight IPv6 addresses, so when a carrier black-holes the address OkHttp picks
 * first, the socket waits forever: the request only ends when the JS
 * AbortController fires, which the rider sees as "Address search timed out"
 * (timeout: timeout) even though the backend answers in under a second.
 *
 * A bounded connect timeout turns that dead route into a fast failover — OkHttp
 * moves to the next address inside the same call — and IPv4 is tried first
 * because Nigerian mobile data hands out unroutable IPv6 far more often.
 */
private const val CONNECT_TIMEOUT_SECONDS = 4L
private const val READ_TIMEOUT_SECONDS = 20L
private const val WRITE_TIMEOUT_SECONDS = 20L

internal object Ipv4FirstDns : Dns {
  override fun lookup(hostname: String): List<InetAddress> {
    val resolved = Dns.SYSTEM.lookup(hostname)
    val ipv4 = resolved.filterIsInstance<Inet4Address>()
    if (ipv4.isEmpty()) return resolved
    return ipv4 + resolved.filterNot { it is Inet4Address }
  }
}

internal class NexrydeOkHttpClientFactory : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient =
      OkHttpClientProvider.createClientBuilder()
          .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
          .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
          .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
          .retryOnConnectionFailure(true)
          .dns(Ipv4FirstDns)
          .build()
}
