import crypto from "crypto"

// Encryption key and initialization vector
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-encryption-key-32-characters"
const IV_LENGTH = 16 // For AES, this is always 16 bytes

interface TokenData {
  access_token: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  [key: string]: any
}

/**
 * Encrypts a token object
 */
export function encryptToken(token: TokenData): string {
  // Add expiration time if not present
  if (token.expires_in && !token.expires_at) {
    token.expires_at = Date.now() + token.expires_in * 1000
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)

  const tokenString = JSON.stringify(token)

  let encrypted = cipher.update(tokenString, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  // Return iv + encrypted data
  return `${iv.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a token string
 */
export function decryptToken(encryptedToken: string): TokenData {
  const [ivHex, encryptedText] = encryptedToken.split(':')
  
  if (!ivHex || !encryptedText) {
    throw new Error('Invalid encrypted token format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted)
}

