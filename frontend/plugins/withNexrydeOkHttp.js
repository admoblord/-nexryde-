/**
 * Production Android fetch goes through expo-cronet's OkHttp interceptor.
 *
 * AAB 322 shipped enableQuic: true. Cronet then tries HTTP/3 (UDP) to
 * Cloud Run before TCP. On Nigerian mobile networks UDP/443 is often
 * black-holed; Chromium's QUIC→TCP fallback is longer than the app's 9s
 * places abort, so pickup/destination search dies with `timeout: timeout`
 * while curl/TCP from a datacenter is ~200ms.
 *
 * This plugin runs after expo-cronet and:
 *   1. forces enableQuic(false) even if app.json is wrong
 *   2. puts real connect/read timeouts on the Cronet OkHttp client
 *      (the interceptor factory otherwise uses OkHttp defaults only)
 */
const { withMainApplication } = require('@expo/config-plugins');

const CONNECT_TIMEOUT =
  '.connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)';

function withNexrydeOkHttp(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    src = src.replace(/\.enableQuic\(\s*true\s*\)/g, '.enableQuic(false)');
    if (src.includes('CronetInterceptor') && !src.includes('connectTimeout(5,')) {
      src = src.replace(
        /OkHttpClient\.Builder\(\)\s*\n\s*\.addInterceptor\(CronetInterceptor/,
        `OkHttpClient.Builder()\n        ${CONNECT_TIMEOUT}\n        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)\n        .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)\n        .retryOnConnectionFailure(true)\n        .addInterceptor(CronetInterceptor`,
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = withNexrydeOkHttp;
