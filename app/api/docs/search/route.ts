import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"
const DEBUG = process.env.NODE_ENV !== 'production'
const MAX_RETRIES = 2

interface GoogleAPIError {
  error: {
    code: number
    message: string
    status: string
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: {
        connections: {
          where: {
            provider: "google",
            isConnected: true
          }
        }
      }
    })

    if (DEBUG) {
      console.log("Found user:", {
        email: user?.email,
        connectionsCount: user?.connections?.length
      })
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.connections.length) {
      return NextResponse.json({
        error: "Google account not connected",
        debug: DEBUG ? { userId: user.id, email: user.email } : undefined
      }, { status: 401 })
    }

    const token = await db.token.findFirst({
      where: {
        userId: user.id,
        provider: "google",
      },
      orderBy: { createdAt: 'desc' }
    })

    if (DEBUG) {
      console.log("Token details:", {
        exists: !!token,
        expired: token ? new Date() > token.expiresAt : null,
        tokenId: token?.id,
        tokenLength: token?.accessToken?.length,
        expiresIn: token ? new Date(token.expiresAt).getTime() - Date.now() : null
      })
    }

    if (!token?.accessToken) {
      return NextResponse.json({ error: "No valid Google token found" }, { status: 401 })
    }

    let accessToken = token.accessToken

    if (new Date() > token.expiresAt) {
      try {
        if (!token.refreshToken) {
          throw new Error("No refresh token available")
        }

        const refreshedToken = await refreshToken(token.refreshToken)
        accessToken = refreshedToken.access_token

        await db.token.update({
          where: { id: token.id },
          data: {
            accessToken: refreshedToken.access_token,
            expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
          },
        })

        if (DEBUG) {
          console.log("Token refreshed:", {
            newTokenLength: refreshedToken.access_token.length,
            expiresIn: refreshedToken.expires_in
          })
        }
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError)
        return NextResponse.json({
          error: "Failed to refresh Google token",
          details: refreshError instanceof Error ? refreshError.message : undefined
        }, { status: 401 })
      }
    }

    const searchQuery = `name contains '${query}' and mimeType = 'application/vnd.google-apps.document'`
    let retryCount = 0
    let lastError: any = null

    while (retryCount <= MAX_RETRIES) {
      try {
        if (DEBUG) {
          console.log(`Attempt ${retryCount + 1}/${MAX_RETRIES + 1}`)
        }

        const response = await fetch(
          `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink,modifiedTime)`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken.trim()}`,
              'Accept': 'application/json',
            },
          }
        )

        if (response.ok) {
          const data = await response.json()
          return NextResponse.json({
            documents: data.files.map((file: any) => ({
              id: file.id,
              name: file.name,
              url: file.webViewLink,
              lastModified: file.modifiedTime,
            }))
          })
        }

        const errorData: GoogleAPIError = await response.json()
        lastError = errorData

        if (response.status === 401 && retryCount < MAX_RETRIES) {
          if (DEBUG) {
            console.log("Attempting token refresh after 401")
          }
          // Force token refresh on next iteration
          token.expiresAt = new Date(0)
          retryCount++
          continue
        }

        break
      } catch (error) {
        lastError = error
        if (retryCount < MAX_RETRIES) {
          retryCount++
          continue
        }
        break
      }
    }

    return NextResponse.json({
      error: "Failed to search documents",
      details: lastError?.error?.message || "Unknown error",
      debug: DEBUG ? {
        retryCount,
        tokenLength: accessToken.length,
        error: lastError
      } : undefined
    }, { status: 401 })

  } catch (error) {
    return NextResponse.json({
      error: "Server error",
      details: error instanceof Error ? error.message : "Unknown error",
      debug: DEBUG ? { stack: error instanceof Error ? error.stack : undefined } : undefined
    }, { status: 500 })
  }
}

// Enhanced refresh token function with validation
async function refreshToken(refreshToken: string) {
  if (!refreshToken) {
    throw new Error("Missing refresh token")
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to refresh token: ${error.error_description || 'Unknown error'}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error("Invalid refresh token response")
  }

  return data
}