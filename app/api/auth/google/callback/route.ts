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

    // Add required scopes
    const REQUIRED_SCOPES = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/documents.readonly"
    ].join(" ")

    try {
      console.log("Exchanging code for token...")
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code: code || '',
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
          grant_type: "authorization_code",
          scope: REQUIRED_SCOPES
        }),
      })

      const tokenData = await tokenResponse.json()
      const encryptedToken = encryptToken(tokenData)
      console.log("Token Response:", JSON.stringify(tokenData, null, 2))
      
      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`Token exchange failed: ${tokenData.error || tokenResponse.statusText}`)
      }

      // Use OAuth2 userinfo endpoint instead of People API
      console.log("Fetching user info...")
      const userResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo", 
        {
          headers: { 
            "Authorization": `Bearer ${tokenData.access_token}`
          }
        }
      )
      
      if (!userResponse.ok) {
        const errorData = await userResponse.json()
        console.error("User info error:", errorData)
        throw new Error(`Failed to fetch user info: ${errorData.error?.message || userResponse.statusText}`)
      }

      const userData = await userResponse.json()
      console.log("User Info Response:", JSON.stringify(userData, null, 2))

      if (!userData.email) {
        throw new Error("Invalid user data received")
      }

      // Database transaction
      console.log("Updating database...")

      await db.$transaction(async (tx) => {
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

    } catch (error: any) {
      console.error("Detailed error:", error)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=${encodeURIComponent(error.message)}`)
    }
  } catch (error) {
    console.error("Error in Google callback:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}