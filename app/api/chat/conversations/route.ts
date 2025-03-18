import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { searchDocuments, getAllDocuments } from "@/lib/document-service"
import { z } from "zod"
import { db } from "@/lib/db"
import OpenAI from 'openai'

// Type definitions
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Validation schemas
const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string()
})

const requestSchema = z.object({
  message: z.string().min(1),
  history: z.array(chatMessageSchema).optional()
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const session = await auth()

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.connections.length) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 403 })
    }

    const body = await request.json()

    const validatedBody = requestSchema.parse(body)
    const { message, history } = validatedBody

    let documents: import('@/lib/document-service').Document[] = []
    // get search terms from the message and search for relevant documents
    if (message) {
      const searchTerms = message.split(" ").filter(term => term.length > 2)
      for (const term of searchTerms) {
        const searchTerm = term.trim()
        if (searchTerm.length > 2) {
          // Search for documents matching the search term
          const foundDocuments = await searchDocuments(user.id, searchTerm)
          documents = [...documents, ...foundDocuments]
        }
      }
      // If no documents found, fall back to getting all documents
      documents = await getAllDocuments(user.id)
    }

    const documentContext = documents.length > 0
      ? documents
          .map(doc => `Document: ${doc.name}\nContent: ${doc.content.substring(0, 1000)}...\n\n`)
          .join("\n")
      : "No relevant documents found."

    const conversationHistory = history
      ? history.map(msg => `${msg.role}: ${msg.content}`).join("\n")
      : ""

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a helpful document assistant that answers questions based on the user's Google Docs.

Here are the relevant documents:
${documentContext}

Previous conversation:
${conversationHistory}

Answer the user's questions based on the content of their documents. If you don't find relevant information in the documents, acknowledge that and provide a general response. Always be helpful, concise, and accurate.`
      },
      {
        role: "user",
        content: message
      }
    ]

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      temperature: 0.7,
      max_tokens: 1000
    })
    
    return new NextResponse(
      JSON.stringify({
        response: completion.choices[0].message.content,
        documents: documents.map(doc => ({
          name: doc.name,
          preview: doc.content.substring(0, 100)
        }))
      }), 
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (error: any) {

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Invalid request format",
        details: error.errors
      }, { status: 400 })
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to generate response"
    }, { status: 500 })
  }
}

// Export GET handler to verify route is registered
export async function GET() {
  return NextResponse.json({ status: "API route working" })
}