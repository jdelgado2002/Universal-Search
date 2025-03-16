import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const session = await auth()
    console.log("Session data:", JSON.stringify(session, null, 2))

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find user by email instead of id
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: {
        connections: true,
        accounts: true
      }
    })
    console.log("User data:", JSON.stringify(user, null, 2))

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const googleConnection = await db.userConnection.findFirst({
      where: {
        userId: user.id, // Use the database user.id instead of session.user.id
        provider: "google"
      },
      include: {
        user: true
      }
    })
    console.log("Google connection:", JSON.stringify(googleConnection, null, 2))

    return NextResponse.json({
      google: googleConnection?.isConnected ?? false,
      debug: {
        userEmail: session.user.email,
        userId: user.id,
        foundUser: true,
        connectionCount: user.connections.length
      }
    })
  } catch (error) {
    console.error("Error fetching connections:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}