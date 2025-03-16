import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { encryptToken } from "@/lib/encryption"

const OAUTH_STATE_COOKIE = "oauth_state"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      console.error("OAuth error:", error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=${error}`)
    }

    // Validate state to prevent CSRF
    const storedState = cookies().get(OAUTH_STATE_COOKIE)?.value
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_state`)
    }

    // Clear state cookie
    cookies().delete(OAUTH_STATE_COOKIE)

    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`)
    }

    // Exchange code for token
    console.log("Exchanging code for token...")
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
        grant_type: "authorization_code"
      })
    })

    const tokenData = await tokenResponse.json()
    
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Token exchange failed:", tokenData)
      throw new Error(`Token exchange failed: ${tokenData.error || tokenResponse.statusText}`)
    }

    // Get user info
    console.log("Fetching user info...")
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Accept": "application/json"
        }
      }
    )

    if (!userResponse.ok) {
      const errorData = await userResponse.json()
      console.error("User info error:", errorData)
      throw new Error(`Failed to fetch user info: ${errorData.error?.message || userResponse.statusText}`)
    }

    const userData = await userResponse.json()

    // Store everything in a transaction
    await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: userData.email },
        create: {
          email: userData.email,
          name: userData.name,
          image: userData.picture
        },
        update: {
          name: userData.name,
          image: userData.picture
        }
      })

      const encryptedToken = encryptToken(tokenData)

      await tx.token.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: "google"
          }
        },
        create: {
          userId: user.id,
          provider: "google",
          accessToken: encryptedToken,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000))
        },
        update: {
          accessToken: encryptedToken,
          refreshToken: tokenData.refresh_token,
          expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000))
        }
      })

      await tx.userConnection.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: "google"
          }
        },
        create: {
          userId: user.id,
          provider: "google",
          isConnected: true,
          lastConnected: new Date()
        },
        update: {
          isConnected: true,
          lastConnected: new Date()
        }
      })
    })

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)

  } catch (error) {
    console.error("Error in Google callback:", error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=${encodeURIComponent(errorMessage)}`)
  }
}