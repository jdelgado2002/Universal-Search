import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { decryptToken } from "@/lib/encryption"

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

// Required scopes for Google Docs API
const SCOPES = [
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ")

export async function GET(request: NextRequest) {
  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15)

  // Store state in a cookie for verification
  cookies().set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  })

  // Construct the Google OAuth URL
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.append("client_id", GOOGLE_CLIENT_ID)
  authUrl.searchParams.append("redirect_uri", REDIRECT_URI)
  authUrl.searchParams.append("response_type", "code")
  authUrl.searchParams.append("scope", SCOPES)
  authUrl.searchParams.append("access_type", "offline")
  authUrl.searchParams.append("state", state)
  authUrl.searchParams.append("prompt", "consent")

  // Redirect the user to Google's OAuth page
  return NextResponse.redirect(authUrl.toString())
}

export async function DELETE(request: NextRequest) {
  try {
    // Get the encrypted token from cookies
    const encryptedToken = cookies().get("google_token")?.value

    if (!encryptedToken) {
      return NextResponse.json({ error: "No token found" }, { status: 400 })
    }

    // Decrypt the token
    const token = decryptToken(encryptedToken)

    // Revoke the token with Google
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })

    // Delete the token cookie
    cookies().delete("google_token")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error revoking token:", error)
    return NextResponse.json({ error: "Failed to revoke token" }, { status: 500 })
  }
}

