import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const googleConnection = await db.userConnection.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: "google"
        }
      }
    })

    return NextResponse.json({
      google: googleConnection?.isConnected ?? false
    })
  } catch (error) {
    console.error("Error fetching connections:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

