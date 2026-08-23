package com.nexryde.app

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Inet4Address
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
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
 *
 * Two ways to burn the rider's whole 9s budget survived that change, and both
 * look identical from the phone: nine seconds of silence while the server logs
 * no request at all.
 *
 * 1. DNS. connectTimeout starts at the socket, so it does not cover name
 *    resolution. Android's resolver retries a silent DNS server for well over
 *    9s, and OkHttp waits for however long that takes.
 * 2. A pooled connection that died without a FIN. Switching Wi-Fi to mobile
 *    data leaves an established HTTP/2 connection in the pool whose socket is
 *    already gone; the request is written into it and no byte ever comes back,
 *    so the call sits there until readTimeout. HTTP/2 pings detect that in
 *    seconds and let OkHttp open a fresh connection instead.
 *
 * Timeouts here are per-operation, not per-call, so document and photo uploads
 * are still free to take as long as they need. The call timeout is only a
 * backstop against a wedged call, far above any real upload.
 */
private const val CONNECT_TIMEOUT_SECONDS = 4L
private const val READ_TIMEOUT_SECONDS = 12L
private const val WRITE_TIMEOUT_SECONDS = 15L
private const val CALL_TIMEOUT_SECONDS = 90L
private const val PING_INTERVAL_SECONDS = 5L
private const val DNS_TIMEOUT_SECONDS = 3L

/**
 * IPv4 first, and never wait on the system resolver longer than a rider will.
 *
 * [Dns.SYSTEM] is a blocking getaddrinfo with no ceiling of its own, so the
 * lookup runs on a daemon thread we can walk away from. A resolver that never
 * answers becomes UnknownHostException in [DNS_TIMEOUT_SECONDS] instead of
 * silence, which OkHttp reports immediately rather than holding the call open.
 */
internal object Ipv4FirstDns : Dns {
  private val resolvers =
      Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "nexryde-dns").apply { isDaemon = true }
      }

  override fun lookup(hostname: String): List<InetAddress> {
    val pending = resolvers.submit<List<InetAddress>> { Dns.SYSTEM.lookup(hostname) }
    val resolved =
        try {
          pending.get(DNS_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (timeout: TimeoutException) {
          // getaddrinfo does not interrupt; the daemon thread is left to finish.
          pending.cancel(true)
          throw UnknownHostException("$hostname not resolved within ${DNS_TIMEOUT_SECONDS}s")
        } catch (interrupted: InterruptedException) {
          pending.cancel(true)
          Thread.currentThread().interrupt()
          throw UnknownHostException("$hostname lookup interrupted")
        } catch (failed: ExecutionException) {
          throw failed.cause as? UnknownHostException
              ?: UnknownHostException("$hostname lookup failed: ${failed.cause?.message}")
        }

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
          .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
          .pingInterval(PING_INTERVAL_SECONDS, TimeUnit.SECONDS)
          .retryOnConnectionFailure(true)
          .dns(Ipv4FirstDns)
          .build()
}
