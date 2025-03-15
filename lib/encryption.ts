import crypto from "crypto"

// Encryption key and initialization vector
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-32-characters"
const IV_LENGTH = 16 // For AES, this is always 16 bytes

/**
 * Encrypts a token object
 */
export function encryptToken(token: any): string {
  // Add expiration time if not present
  if (token.expires_in && !token.expires_at) {
    token.expires_at = Date.now() + token.expires_in * 1000
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv)

  const tokenString = JSON.stringify(token)

  let encrypted = cipher.update(tokenString, "utf8", "hex")
  encrypted += cipher.final("hex")

  // Return iv + encrypted data
  return iv.toString("hex") + ":" + encrypted
}

/**
 * Decrypts a token string
 */
export function decryptToken(encryptedToken: string): any {
  const textParts = encryptedToken.split(":")
  const iv = Buffer.from(textParts.shift()!, "hex")
  const encryptedText = textParts.join(":")

  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv)

  let decrypted = decipher.update(encryptedText, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return JSON.parse(decrypted)
}

