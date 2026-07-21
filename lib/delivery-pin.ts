import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const PIN_TTL_MS = 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.DELIVERY_PIN_SECRET;
  if (!value || value.length < 32) throw new Error("DELIVERY_PIN_SECRET debe tener al menos 32 caracteres.");
  return value;
}

function encryptionKey() {
  return createHmac("sha256", secret()).update("elmenu-delivery-pin-encryption-v1").digest();
}

export function hashDeliveryPin(orderNumber: string, pin: string) {
  return createHmac("sha256", secret()).update(`${orderNumber}:${pin}`).digest("hex");
}

function encryptDeliveryPin(pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function revealDeliveryPin(ciphertext: string) {
  const [ivRaw, tagRaw, encryptedRaw] = ciphertext.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("PIN cifrado inválido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8");
}

export function createDeliveryPin(orderNumber: string, now = new Date()) {
  const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
  return {
    deliveryPinHash: hashDeliveryPin(orderNumber, pin),
    deliveryPinCiphertext: encryptDeliveryPin(pin),
    deliveryPinCreatedAt: now.toISOString(),
    deliveryPinExpiresAt: new Date(now.getTime() + PIN_TTL_MS).toISOString(),
    deliveryPinAttemptCount: 0,
    deliveryVerificationMethod: "pin",
    deliveryVerificationStatus: "pending",
  } as const;
}

export function isDeliveryPinValid(orderNumber: string, pin: string, expectedHash: string) {
  if (!/^\d{6}$/.test(pin) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(Buffer.from(hashDeliveryPin(orderNumber, pin), "hex"), Buffer.from(expectedHash, "hex"));
}
