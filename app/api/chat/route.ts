import { type NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { searchDocuments, getAllDocuments } from "@/lib/document-service"

export async function POST(request: NextRequest) {
  // Get the authenticated user
  const session = await auth()

  if (!session || !session.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message, history } = body

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Determine if we need to search for specific documents or get all documents
    let documents = []

    if (message.toLowerCase().includes("search") || message.toLowerCase().includes("find")) {
      // Extract search terms
      const searchTerms = message.replace(/search|find|for|about/gi, "").trim()
      documents = await searchDocuments(session.user.id, searchTerms)
    } else {
      // Get all documents for general questions
      documents = await getAllDocuments(session.user.id)
    }

    // Prepare document context
    let documentContext = ""

    if (documents.length > 0) {
      documentContext = documents
        .map((doc) => `Document: ${doc.name}\nContent: ${doc.content.substring(0, 1000)}...\n\n`)
        .join("\n")
    } else {
      documentContext = "No relevant documents found."
    }

    // Prepare conversation history
    const conversationHistory = history ? history.map((msg: any) => `${msg.role}: ${msg.content}`).join("\n") : ""

    // Generate response using OpenAI
    const { text } = await generateText({
      model: openai("gpt-4o"),
      prompt: message,
      system: `You are a helpful document assistant that answers questions based on the user's Google Docs.
      
      Here are the relevant documents:
      ${documentContext}
      
      Previous conversation:
      ${conversationHistory}
      
      Answer the user's questions based on the content of their documents. If you don't find relevant information in the documents, acknowledge that and provide a general response. Always be helpful, concise, and accurate.`,
    })

    return NextResponse.json({ response: text })
  } catch (error: any) {
    console.error("Chat error:", error)
    return NextResponse.json({ error: error.message || "Failed to generate response" }, { status: 500 })
  }
}

