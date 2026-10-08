import UIKit
import WebKit
import CoreLocation
import AVFoundation

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, CLLocationManagerDelegate {
    private let appURL = URL(string: "https://ufukcicek81.github.io/gazonride/")!
    private let locationManager = CLLocationManager()
    private var webView: WKWebView!
    private var rideActive = false
    private var bufferedLocations: [[String: Any]] = []
    private var pendingOAuth: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        configureLocation()
        configureWebView()
        NotificationCenter.default.addObserver(self, selector: #selector(handleOAuth(_:)), name: .gazonRideOAuthCallback, object: nil)
        loadLiveApp()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "gazonNative")
    }

    private func configureWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: "gazonNative")

        let bridge = """
        (function(){
          window.GaZonIOS = true;
          window.AndroidBridge = window.AndroidBridge || {};
          window.AndroidBridge.startRide = function(){ window.webkit.messageHandlers.gazonNative.postMessage({action:'startRide'}); };
          window.AndroidBridge.stopRide = function(){ window.webkit.messageHandlers.gazonNative.postMessage({action:'stopRide'}); };
          window.AndroidBridge.clearBufferedPoints = function(){ window.webkit.messageHandlers.gazonNative.postMessage({action:'clearBuffer'}); };
          window.AndroidBridge.getBufferedPoints = function(){ return '[]'; };
          window.AndroidBridge.getSystemTheme = function(){ return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; };
          window.AndroidBridge.openOAuth = function(url){ window.webkit.messageHandlers.gazonNative.postMessage({action:'openOAuth',url:String(url||'')}); };
        })();
        """
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: false))

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureLocation() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locationManager.distanceFilter = 3
        locationManager.activityType = .automotiveNavigation
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.showsBackgroundLocationIndicator = true

        if locationManager.authorizationStatus == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
        } else if locationManager.authorizationStatus == .authorizedWhenInUse {
            locationManager.requestAlwaysAuthorization()
        }
    }

    private func loadLiveApp() {
        var components = URLComponents(url: appURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "ios", value: "1"),
            URLQueryItem(name: "v", value: String(Int(Date().timeIntervalSince1970)))
        ]
        var request = URLRequest(url: components.url!)
        request.cachePolicy = .reloadRevalidatingCacheData
        webView.load(request)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        flushBufferedLocations()
        deliverPendingOAuth()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel); return
        }
        if url.scheme == "gazonride" {
            pendingOAuth = url.absoluteString
            deliverPendingOAuth()
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "gazonNative",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "startRide":
            startNativeRide()
        case "stopRide":
            stopNativeRide()
        case "clearBuffer":
            bufferedLocations.removeAll()
        case "openOAuth":
            if let raw = body["url"] as? String, let url = URL(string: raw) {
                UIApplication.shared.open(url)
            }
        default:
            break
        }
    }

    private func startNativeRide() {
        rideActive = true
        if locationManager.authorizationStatus == .authorizedWhenInUse {
            locationManager.requestAlwaysAuthorization()
        }
        locationManager.startUpdatingLocation()
    }

    private func stopNativeRide() {
        rideActive = false
        locationManager.stopUpdatingLocation()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedAlways:
            manager.startUpdatingLocation()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, loc.horizontalAccuracy >= 0 else { return }
        let point: [String: Any] = [
            "lat": loc.coordinate.latitude,
            "lon": loc.coordinate.longitude,
            "accuracy": loc.horizontalAccuracy,
            "altitude": loc.altitude,
            "speed": max(0, loc.speed),
            "heading": loc.course >= 0 ? loc.course : NSNull(),
            "time": Int(loc.timestamp.timeIntervalSince1970 * 1000)
        ]

        if UIApplication.shared.applicationState == .active {
            sendLocationToWeb(point)
        } else if rideActive {
            bufferedLocations.append(point)
            if bufferedLocations.count > 5000 {
                bufferedLocations.removeFirst(bufferedLocations.count - 5000)
            }
        }
    }

    private func sendLocationToWeb(_ point: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(point),
              let data = try? JSONSerialization.data(withJSONObject: point),
              let json = String(data: data, encoding: .utf8) else { return }

        let js = """
        (function(){
          var p=(json);
          if(typeof applyPosition==='function'){
            applyPosition({timestamp:p.time,coords:{latitude:p.lat,longitude:p.lon,accuracy:p.accuracy,altitude:p.altitude,speed:p.speed,heading:p.heading}});
          }
        })();
        """
        webView.evaluateJavaScript(js)
    }

    private func flushBufferedLocations() {
        guard !bufferedLocations.isEmpty else { return }
        let points = bufferedLocations
        bufferedLocations.removeAll()
        for point in points { sendLocationToWeb(point) }
    }

    @objc private func handleOAuth(_ note: Notification) {
        pendingOAuth = note.object as? String
        deliverPendingOAuth()
    }

    private func deliverPendingOAuth() {
        guard let callback = pendingOAuth else { return }
        let escaped = callback
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let js = "if(window.GaZonAuth&&GaZonAuth.completeOAuthCallback){GaZonAuth.completeOAuthCallback('\(escaped)');true}else{false}"
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            if let ok = result as? Bool, ok { self?.pendingOAuth = nil }
        }
    }
}
