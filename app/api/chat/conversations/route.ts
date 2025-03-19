import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { searchDocuments } from "@/lib/document-service"
import { z } from "zod"
import { db } from "@/lib/db"
import OpenAI from 'openai'

// Constants for limits
const MAX_SEARCH_TERMS = 5
const MAX_DOCUMENTS = 10
const MIN_TERM_LENGTH = 3

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

// Add new helper function to extract search terms
async function extractSearchTerms(message: string): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are an expert in identifying the most relevant search keywords based on user input. Your goal is to extract and generate the most effective keyterms that capture the intent behind the query. These keywords will be used to search for relevant documents in platforms like Google Docs, Jira, Asana, and others.

Guidelines:
- Focus on core intent rather than exact phrasing.
- Extract high-signal words and remove unnecessary filler words.
- Use synonyms and variations when helpful.
- Preserve domain-specific terminology.
- Format output as a comma-separated list of keywords.

Your response should contain only the keywords, formatted as a comma-separated list, with no additional text.`
      },
      {
        role: "user",
        content: message
      }
    ],
    temperature: 0.3,
    max_tokens: 100
  })

  const searchTerms = completion.choices[0].message.content?.split(',')
    .map(term => term.trim())
    .filter(term => term.length >= MIN_TERM_LENGTH)
    .slice(0, MAX_SEARCH_TERMS) ?? []

  return searchTerms
}

export async function POST(request: NextRequest) {

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

    // Use a Map to track unique documents by ID
    const documentMap = new Map()

    if (message) {
      // Extract search terms using OpenAI
      const searchTerms = await extractSearchTerms(message)
      
      if (searchTerms.length > 0) {
        // Single search operation for all terms
        const searchQuery = searchTerms.join(" ")
        const foundDocuments = await searchDocuments(user.id, searchQuery)

        // Add documents to map, ensuring uniqueness
        foundDocuments.forEach(doc => {
          if (!documentMap.has(doc.id) && documentMap.size < MAX_DOCUMENTS) {
            documentMap.set(doc.id, doc)
          }
        })
      }
    }

    // Convert map back to array
    const documents = Array.from(documentMap.values())

    const documentContext = documents.length > 0
      ? documents
          .map(doc => `Document: ${doc.name}\nContent: ${doc.content.substring(0, 10000)}...\n\n`)
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
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 10000
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