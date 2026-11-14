package com.referralpanda.reactnative

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerClient.InstallReferrerResponse
import com.android.installreferrer.api.InstallReferrerStateListener
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The two things the SDK needs from Android that React Native does not have: the Play
 * Install Referrer (which share link an install came from) and the app's version.
 *
 * The referrer is read on the device from Google Play. Nothing is fingerprinted.
 */
class ReferralPandaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReferralPanda")

    Function("getAppVersion") {
      val context = appContext.reactContext ?: return@Function null
      runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
      }.getOrNull()
    }

    // Resolves the raw referrer string, or null when this device will never have one
    // (no Play Store). Rejects when Play is only busy, so the SDK asks again next time.
    AsyncFunction("getInstallReferrer") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_NO_CONTEXT", "The app is not ready yet.", null))
        return@AsyncFunction
      }
      val client = InstallReferrerClient.newBuilder(context).build()
      var settled = false
      val finish = { block: () -> Unit ->
        if (!settled) {
          settled = true
          block()
          runCatching { client.endConnection() }
        }
      }
      try {
        client.startConnection(object : InstallReferrerStateListener {
          override fun onInstallReferrerSetupFinished(responseCode: Int) {
            when (responseCode) {
              InstallReferrerResponse.OK ->
                finish {
                  runCatching { client.installReferrer.installReferrer }
                    .onSuccess { promise.resolve(it) }
                    .onFailure {
                      promise.reject(CodedException("ERR_REFERRER", "Could not read the install referrer.", it))
                    }
                }
              InstallReferrerResponse.FEATURE_NOT_SUPPORTED,
              InstallReferrerResponse.DEVELOPER_ERROR ->
                finish { promise.resolve(null) }
              else ->
                finish {
                  promise.reject(CodedException("ERR_REFERRER_UNAVAILABLE", "Google Play is not available right now.", null))
                }
            }
          }

          override fun onInstallReferrerServiceDisconnected() {
            finish {
              promise.reject(CodedException("ERR_REFERRER_UNAVAILABLE", "Google Play disconnected.", null))
            }
          }
        })
      } catch (error: Throwable) {
        // No Play Store on this device at all.
        finish { promise.resolve(null) }
      }
    }
  }
}
