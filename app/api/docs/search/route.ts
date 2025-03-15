import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

// Google API endpoints
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q")

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 })
  }

  // Get the authenticated user
  const session = await auth()

  if (!session || !session.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    // Get the user's Google token from the database
    const token = await prisma.token.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: "google",
        },
      },
    })

    if (!token) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 401 })
    }

    // Check if token is expired
    if (new Date() > token.expiresAt) {
      // Token is expired, refresh it
      const refreshedToken = await refreshToken(token.refreshToken!)

      // Update the token in the database
      await prisma.token.update({
        where: {
          id: token.id,
        },
        data: {
          accessToken: refreshedToken.access_token,
          expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
        },
      })

      // Use the new access token
      token.accessToken = refreshedToken.access_token
    }

    // Search for documents in Google Drive
    // We're specifically looking for Google Docs files
    const searchQuery = `name contains '${query}' and mimeType = 'application/vnd.google-apps.document'`

    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink,modifiedTime)`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
      },
    )

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Google API error:", errorData)
      return NextResponse.json({ error: "Failed to search documents" }, { status: response.status })
    }

    const data = await response.json()

    // Format the response
    const documents = data.files.map((file: any) => ({
      id: file.id,
      name: file.name,
      url: file.webViewLink,
      lastModified: file.modifiedTime,
    }))

    return NextResponse.json({ documents })
  } catch (error) {
    console.error("Error searching documents:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

async function refreshToken(refreshToken: string) {
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
    throw new Error("Failed to refresh token")
  }

  return await response.json()
}

