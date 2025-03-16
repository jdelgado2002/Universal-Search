import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { cookies } from "next/headers"

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`

// Required scopes for Google Docs API
const REQUIRED_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly"
].join(" ")

export async function GET(request: NextRequest) {
  // Get the authenticated user
  const session = await auth()

  if (!session || !session.user) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth/signin`)
  }

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(2, 15)

  // Store state in a cookie for verification
  cookies().set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  })

  // Store the user ID in a cookie for the callback
  cookies().set("oauth_user_id", session.user.id.toString(), {
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
  authUrl.searchParams.append("scope", REQUIRED_SCOPES)
  authUrl.searchParams.append("access_type", "offline")
  authUrl.searchParams.append("state", state)
  authUrl.searchParams.append("prompt", "consent")

  // Redirect the user to Google's OAuth page
  return NextResponse.redirect(authUrl.toString())
}

