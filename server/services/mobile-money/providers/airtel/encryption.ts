/**
 * Airtel Encryption Service
 * Gère le chiffrement "Encryption 2.0" d'Airtel
 * - Génération AES Key/IV
 * - Chiffrement payload avec AES-256-CBC
 * - Chiffrement clé AES avec RSA publique Airtel
 * - Vérification HMAC-SHA256 des callbacks
 *
 * Documentation Airtel:
 * - PIN: Chiffré avec RSA PKCS1 uniquement
 * - Payload V3: Chiffré avec AES-256-CBC, clé AES chiffrée avec RSA
 */

import * as crypto from "crypto";

interface CachedPublicKey {
  key: string;
  fetchedAt: number; // timestamp ms
  expiresAt: number; // timestamp ms
}

export class AirtelEncryptionService {
  private cachedKey: CachedPublicKey | null = null;
  private keyTtlMs: number;

  constructor(
    private baseUrl: string,
    private country: string,
    private currency: string,
    keyTtlMs: number = 24 * 60 * 60 * 1000 // 24h par défaut
  ) {
    this.keyTtlMs = keyTtlMs;
  }

  /**
   * Récupère la clé publique RSA d'Airtel
   * Endpoint: GET /v1/rsa/encryption-keys
   *
   * La clé est mise en cache avec un TTL configurable
   */
  async getPublicKey(accessToken: string): Promise<string> {
    // Vérifier si la clé en cache est encore valide
    if (this.cachedKey && Date.now() < this.cachedKey.expiresAt) {
      return this.cachedKey.key;
    }

    try {
      console.log("[Airtel Encryption] Fetching RSA public key...");

      const response = await fetch(`${this.baseUrl}/v1/rsa/encryption-keys`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Country": this.country,
          "X-Currency": this.currency,
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // La clé vient souvent sous forme de chaîne simple dans data.data.key
      // Il faut s'assurer qu'elle est bien formatée PEM
      let key: string = data.data.key;
      if (!key.includes("BEGIN PUBLIC KEY")) {
        key = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
      }

      // Mettre en cache avec TTL
      const now = Date.now();
      this.cachedKey = {
        key,
        fetchedAt: now,
        expiresAt: now + this.keyTtlMs,
      };

      console.log(
        `[Airtel Encryption] Public key fetched and cached (TTL: ${Math.round(this.keyTtlMs / 1000 / 60)}min)`
      );
      return key;
    } catch (error) {
      console.error("[Airtel Encryption] Failed to fetch public key:", error);
      throw new Error("AIRTEL_ENCRYPTION_KEY_FETCH_FAILED");
    }
  }

  /**
   * Invalide le cache de la clé publique
   * Utile si la clé a été rotée côté Airtel ou si le chiffrement échoue
   */
  invalidatePublicKey(): void {
    this.cachedKey = null;
    console.log("[Airtel Encryption] Public key cache invalidated");
  }

  /**
   * Retourne les infos du cache de la clé (pour monitoring)
   */
  getKeyInfo(): { hasKey: boolean; expiresIn?: number; age?: number } {
    if (!this.cachedKey) {
      return { hasKey: false };
    }

    const now = Date.now();
    return {
      hasKey: true,
      expiresIn: Math.max(0, Math.floor((this.cachedKey.expiresAt - now) / 1000)),
      age: Math.floor((now - this.cachedKey.fetchedAt) / 1000),
    };
  }

  /**
   * Chiffre le payload selon la norme Airtel V2.0
   * 1. Génère AES Key (32 bytes) & IV (16 bytes)
   * 2. Chiffre Body avec AES-256-CBC
   * 3. Chiffre (AESKey:IV) avec RSA Publique Airtel
   *
   * @returns { encryptedBody, encryptedKey } pour les headers x-signature et x-key
   */
  async encryptPayload(
    payload: unknown,
    accessToken: string
  ): Promise<{ encryptedBody: string; encryptedKey: string }> {
    const rsaPublicKey = await this.getPublicKey(accessToken);

    // 1. Générer Random AES Key (32 bytes) et IV (16 bytes)
    const aesKey = crypto.randomBytes(32);
    const aesIv = crypto.randomBytes(16);

    // 2. Chiffrer le payload avec AES-256-CBC
    const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, aesIv);
    let encryptedBody = cipher.update(JSON.stringify(payload), "utf8", "base64");
    encryptedBody += cipher.final("base64");

    // 3. Préparer la clé combinée (Base64Key:Base64IV)
    const aesKeyBase64 = aesKey.toString("base64");
    const aesIvBase64 = aesIv.toString("base64");
    const combinedKey = `${aesKeyBase64}:${aesIvBase64}`;

    // 4. Chiffrer la clé combinée avec RSA Public Key
    const encryptedKey = crypto
      .publicEncrypt(
        {
          key: rsaPublicKey,
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(combinedKey)
      )
      .toString("base64");

    return {
      encryptedBody, // Devient le header x-signature
      encryptedKey, // Devient le header x-key
    };
  }

  /**
   * Chiffre le PIN (4 chiffres) uniquement avec RSA
   * Utilisé dans certaines requêtes V1 ou V3
   */
  async encryptPin(pin: string, accessToken: string): Promise<string> {
    const rsaPublicKey = await this.getPublicKey(accessToken);
    const buffer = Buffer.from(pin);
    const encrypted = crypto.publicEncrypt(
      {
        key: rsaPublicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return encrypted.toString("base64");
  }

  /**
   * Déchiffre un payload reçu (si nécessaire pour les callbacks)
   * Utilise AES-256-CBC avec la clé reçue
   */
  decryptPayload(encryptedBody: string, aesKey: Buffer, aesIv: Buffer): string {
    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, aesIv);
    let decrypted = decipher.update(encryptedBody, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Vérifie la signature HMAC-SHA256 d'un callback Airtel
   *
   * Airtel envoie la signature dans le header (configurable)
   * La signature est calculée sur le body JSON stringifié
   *
   * @param payload - Le body du callback (objet ou string)
   * @param signature - La signature reçue dans le header
   * @param hmacSecret - Le secret HMAC partagé avec Airtel
   * @returns true si la signature est valide
   */
  static verifyCallbackSignature(
    payload: unknown,
    signature: string,
    hmacSecret: string
  ): boolean {
    if (!signature || !hmacSecret) {
      console.warn("[Airtel Encryption] Missing signature or HMAC secret for verification");
      return false;
    }

    try {
      // Le payload doit être stringifié de manière cohérente
      const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);

      // Calculer le HMAC-SHA256
      const hmac = crypto.createHmac("sha256", hmacSecret);
      const computedSignature = hmac.update(payloadString).digest("base64");

      // Comparaison timing-safe pour éviter les timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );

      if (!isValid) {
        console.warn("[Airtel Encryption] Callback signature mismatch");
      }

      return isValid;
    } catch (error) {
      // En cas d'erreur (ex: longueurs différentes), la signature est invalide
      console.error("[Airtel Encryption] Signature verification error:", error);
      return false;
    }
  }

  /**
   * Génère une signature HMAC-SHA256 pour les requêtes sortantes
   * (si nécessaire pour certains endpoints Airtel)
   */
  static generateHmacSignature(payload: unknown, hmacSecret: string): string {
    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac("sha256", hmacSecret);
    return hmac.update(payloadString).digest("base64");
  }
}

/**
 * Réinitialise le cache de la clé (utile pour les tests)
 */
export function resetAirtelEncryptionCache(service: AirtelEncryptionService): void {
  service.invalidatePublicKey();
}
