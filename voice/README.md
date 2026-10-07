# GazonRide Voice

WebSocket signaling service for the cross-platform group intercom. It does not carry or store audio; it only exchanges WebRTC signaling messages.

Production: deploy this service over HTTPS/WSS and configure a TURN server for reliable connections across mobile networks. Never commit TURN credentials or API secrets.
