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
import okhttp3.ConnectionPool
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Protocol

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
 * Live evidence from revision nexryde-backend-00248-slm: Google Places returns
 * HTTP 200 in 215–1272ms (BEFORE and AFTER both printed). The 9s abort is
 * therefore not Maps, Redis, or our handler. It is the phone holding an HTTP
 * call that never completes.
 *
 * HTTP/2 is the remaining match. Cloud Run's frontend ACKs HTTP/2 pings even
 * when the request stream is dead (Wi-Fi → LTE, a half-open multiplexed
 * connection). pingInterval then looks healthy, readTimeout (previously 12s)
 * never fires before the JS 9s abort, and Cloud Run often never sees the
 * request. HTTP/1.1 has one request per connection: a dead socket errors
 * instead of sitting silent.
 *
 * IPv6 is dropped entirely. Trying it second still costs a connectTimeout when
 * the carrier has unroutable AAAA records; eight of those burned the 9s budget
 * even after IPv4-first ordering.
 *
 * Timeouts here are per-operation, not per-call, so document and photo uploads
 * are still free to take as long as they need. The call timeout is only a
 * backstop against a wedged call, far above any real upload. Places search is
 * capped in JS at 9s, so connect and read must stay under that.
 */
private const val CONNECT_TIMEOUT_SECONDS = 2L
private const val READ_TIMEOUT_SECONDS = 8L
private const val WRITE_TIMEOUT_SECONDS = 15L
private const val CALL_TIMEOUT_SECONDS = 90L
private const val PING_INTERVAL_SECONDS = 5L
private const val DNS_TIMEOUT_SECONDS = 3L
private const val KEEP_ALIVE_SECONDS = 5L
private const val MAX_IDLE_CONNECTIONS = 5

/**
 * IPv4 only, and never wait on the system resolver longer than a rider will.
 *
 * [Dns.SYSTEM] is a blocking getaddrinfo with no ceiling of its own, so the
 * lookup runs on a daemon thread we can walk away from. A resolver that never
 * answers becomes UnknownHostException in [DNS_TIMEOUT_SECONDS] instead of
 * silence, which OkHttp reports immediately rather than holding the call open.
 *
 * AAAA records are discarded when any A record exists. Nigerian mobile data
 * frequently returns unroutable IPv6; each black-holed connect used to consume
 * the whole places budget before OkHttp moved on.
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
    return ipv4
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
          .connectionPool(ConnectionPool(MAX_IDLE_CONNECTIONS, KEEP_ALIVE_SECONDS, TimeUnit.SECONDS))
          .protocols(listOf(Protocol.HTTP_1_1))
          .dns(Ipv4FirstDns)
          .build()
}
