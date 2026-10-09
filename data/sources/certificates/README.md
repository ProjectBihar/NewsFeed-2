# Official endpoint certificate intermediates

`official-intermediates.pem` contains only missing issuer intermediates, not new
root certificates. The complete chains were verified against the Git distribution's
trusted root bundle using OpenSSL `verify` before inclusion. TLS verification stays enabled.

Issuer-published certificate locations, advertised in endpoint certificates:

- BPSC: http://crt.sectigo.com/GoGetSSLRSADVSSLCA2.crt
- BSDMA: http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
- East Central Railway: http://repository.emsign.com/certs/EMDVTLSCAG2A1EE.p7c

The railway PKCS7 includes a root; only its first two intermediate certificates
are included here. These files are public certificates, never credentials.

The worker workflows append this bundle to the existing Supabase public CA file
and provide it via `NODE_EXTRA_CA_CERTS`. Recheck issuer chains if publishers rotate
certificates. East Champaran's hostname mismatch is not repaired or bypassed.
