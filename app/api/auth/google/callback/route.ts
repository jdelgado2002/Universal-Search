import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { encryptToken } from "@/lib/encryption"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const error = searchParams.get("error")

    if (error) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=${error}`)
    }

    if (!code) {
      return NextResponse.json({ error: "No code provided" }, { status: 400 })
    }

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        console.error("Token exchange failed:", errorData)
        throw new Error("Failed to exchange code for token")
      }

      const tokenData = await tokenResponse.json()
      const encryptedToken = encryptToken(tokenData)

      // Get user info to create/update user
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user info")
      }

      const userData = await userResponse.json()

      // Use transaction to ensure data consistency
      await db.$transaction(async (tx) => {
        // Create or update user
        const user = await tx.user.upsert({
          where: { email: userData.email },
          create: {
            email: userData.email,
            name: userData.name,
            image: userData.picture,
          },
          update: {
            name: userData.name,
            image: userData.picture,
          },
        })

        // Store token
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
            expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          },
          update: {
            accessToken: encryptedToken,
            refreshToken: tokenData.refresh_token,
            expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          },
        })

        // Update connection status
        await tx.userConnection.upsert({
          where: {
            userId_provider: {
              userId: session.user.id,
              provider: "google"
            }
          },
          update: {
            isConnected: true,
            lastConnected: new Date()
          },
          create: {
            userId: session.user.id,
            provider: "google",
            isConnected: true,
            lastConnected: new Date()
          }
        })
      })

      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard`)
    } catch (error) {
      console.error("Error exchanging code for token:", error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=token_exchange_failed`)
    }
  } catch (error) {
    console.error("Error in Google callback:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

