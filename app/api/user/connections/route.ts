import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/db"

export async function GET(request: NextRequest) {
  // Get the authenticated user
  const session = await auth()

  if (!session || !session.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    // Check if the user has connected Google
    const googleToken = await prisma.token.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: "google",
        },
      },
    })

    // Return the connections
    return NextResponse.json({
      google: !!googleToken,
    })
  } catch (error) {
    console.error("Error checking connections:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

