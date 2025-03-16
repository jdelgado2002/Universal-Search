import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { searchDocuments, getAllDocuments } from "@/lib/document-service"
import { z } from "zod"
import { db } from "@/lib/db"

// Type definitions
interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

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
  try {
    // Validate session
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Find user by email and include their connections
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

    // Check if user has active Google connection
    if (!user.connections.length) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 403 })
    }

    // Validate request body
    const body = await request.json()
    const validatedBody = requestSchema.parse(body)
    const { message, history } = validatedBody

    // Get documents using database user.id
    let documents = []
    if (message.toLowerCase().includes("search") || message.toLowerCase().includes("find")) {
      const searchTerms = message.replace(/search|find|for|about/gi, "").trim()
      documents = await searchDocuments(user.id, searchTerms)
    } else {
      documents = await getAllDocuments(user.id)
    }

    // Prepare context
    const documentContext = documents.length > 0
      ? documents
          .map(doc => `Document: ${doc.name}\nContent: ${doc.content.substring(0, 1000)}...\n\n`)
          .join("\n")
      : "No relevant documents found."

    // Format conversation history
    const conversationHistory = history 
      ? history.map(msg => `${msg.role}: ${msg.content}`).join("\n")
      : ""

    // System prompt
    const systemPrompt = `You are a helpful document assistant that answers questions based on the user's Google Docs.
      
Here are the relevant documents:
${documentContext}

Previous conversation:
${conversationHistory}

Answer the user's questions based on the content of their documents. If you don't find relevant information in the documents, acknowledge that and provide a general response. Always be helpful, concise, and accurate.`

    // Generate response
    const response = await generateText({
      model: openai("gpt-4"),
      prompt: message,
      system: systemPrompt,
      temperature: 0.7,
      max_tokens: 1000
    })

    return NextResponse.json({ 
      response: response.text,
      documents: documents.map(doc => ({ 
        name: doc.name, 
        preview: doc.content.substring(0, 100) 
      }))
    })

  } catch (error) {
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