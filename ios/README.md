# GaZonRide iOS

Bu proje canlı GaZonRide web uygulamasını WKWebView içinde çalıştıran native iOS kabuğudur.

## Güncelleme modeli

- HTML/CSS/JS, navigasyon, topluluk, 3D tekrar ve çoğu uygulama özelliği `https://ufukcicek81.github.io/gazonride/` üzerinden canlı yüklenir.
- Bu değişiklikler için kullanıcıların App Store/TestFlight sürümünü yeniden kurması gerekmez.
- Yalnızca native Swift kodu, iOS izinleri, background mode veya Apple capability değişirse yeni TestFlight/App Store sürümü gerekir.

## Yerel açma

1. XcodeGen kur: `brew install xcodegen`
2. `cd ios && xcodegen generate`
3. Oluşan `GaZonRide.xcodeproj` dosyasını Xcode ile aç.
4. Signing & Capabilities bölümünde Apple Team seç.
5. Gerçek iPhone üzerinde konum ve arka plan sürüşünü test et.

## TestFlight

TestFlight dağıtımı için aktif Apple Developer hesabı, App Store Connect uygulama kaydı ve signing gerekir.
