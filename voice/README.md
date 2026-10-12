# GazonRide Voice

WebSocket signaling service for the cross-platform group intercom. It does not carry or store audio; it only exchanges WebRTC signaling messages.

Production: deploy this service over HTTPS/WSS and configure a TURN server for reliable connections across mobile networks. Never commit TURN credentials or API secrets.

## TURN (mobil veri için gerekli)

Telefonlar 4G/5G'deyken doğrudan ses bağlantısı çoğu zaman kurulamaz. Sunucu,
aşağıdaki ortam değişkenlerinden biri tanımlıysa uygulamaya kısa ömürlü TURN
bilgisi verir (`GET /ice`, yalnızca `ALLOWED_ORIGINS` adresinden):

| Sağlayıcı | Değişkenler |
|---|---|
| Cloudflare Calls TURN (ücretsiz kota) | `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` |
| Metered.ca | `METERED_DOMAIN`, `METERED_API_KEY` |
| Kendi TURN sunucun | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` |

`ALLOWED_ORIGINS` varsayılanı `https://ufukcicek81.github.io`.
