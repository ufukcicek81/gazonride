import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey : Any] = [:]
    ) -> Bool {
        guard url.scheme?.lowercased() == "gazonride" else { return false }
        NotificationCenter.default.post(name: .gazonRideOAuthCallback, object: url.absoluteString)
        return true
    }
}

extension Notification.Name {
    static let gazonRideOAuthCallback = Notification.Name("GaZonRideOAuthCallback")
}
