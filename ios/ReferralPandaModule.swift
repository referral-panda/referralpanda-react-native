import ExpoModulesCore
import StoreKit
import UIKit

/// The two things the SDK needs from iOS that React Native does not have:
/// Apple's own offer code sheet, and the app's version.
///
/// Store compliance (docs/store-compliance.md): the sheet is Apple's. The SDK never
/// redeems a code itself and never unlocks anything.
public class ReferralPandaModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReferralPanda")

    Function("getAppVersion") { () -> String? in
      Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
    }

    AsyncFunction("presentOfferCodeRedemption") { () async throws in
      if #available(iOS 16.0, *) {
        let scene = await MainActor.run {
          UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        }
        guard let scene else {
          throw Exception(
            name: "ERR_NO_SCENE",
            description: "The offer code sheet needs the app to be in the foreground."
          )
        }
        try await AppStore.presentOfferCodeRedeemSheet(in: scene)
      } else {
        await MainActor.run {
          SKPaymentQueue.default().presentCodeRedemptionSheet()
        }
      }
    }
  }
}
