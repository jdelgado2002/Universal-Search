import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const session = await auth()

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

    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}