import Flutter
import UIKit
import GoogleMaps

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    var mapsKey = Bundle.main.object(forInfoDictionaryKey: "GoogleMapsApiKey") as? String
    if mapsKey == nil || mapsKey?.isEmpty == true {
      if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
         let dict = NSDictionary(contentsOfFile: path) as? [String: Any],
         let key = dict["API_KEY"] as? String {
        mapsKey = key
      }
    }
    if let key = mapsKey, !key.isEmpty {
      GMSServices.provideAPIKey(key)
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
