import { db } from "@/lib/db"

// Google API endpoints
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"
const GOOGLE_DOCS_API = "https://www.googleapis.com/docs/v1"
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

export interface Document {
  id: string
  name: string
  content: string
  url: string
  lastModified: string
}

export async function searchDocuments(userId: string, query: string): Promise<Document[]> {
  // Get the user's Google token from the database
  const token = await db.token.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "google",
      },
    },
  })

  if (!token) {
    throw new Error("Google account not connected")
  }

  // Check if token is expired
  if (new Date() > token.expiresAt) {
    // Token is expired, refresh it
    const refreshedToken = await refreshToken(token.refreshToken!)

    // Update the token in the database
    await db.token.update({
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
    throw new Error("Failed to search documents")
  }

  const data = await response.json()

  // Fetch the content of each document
  const documents: Document[] = []

  for (const file of data.files) {
    try {
      const docContent = await fetchDocumentContent(file.id, token.accessToken)

      documents.push({
        id: file.id,
        name: file.name,
        content: docContent,
        url: file.webViewLink,
        lastModified: file.modifiedTime,
      })
    } catch (error) {
      console.error(`Error fetching content for document ${file.id}:`, error)
    }
  }

  return documents
}

async function fetchDocumentContent(documentId: string, accessToken: string): Promise<string> {
  if (!accessToken?.trim()) {
    throw new Error("Invalid access token")
  }

  const response = await fetch(`${GOOGLE_DOCS_API}/documents/${documentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken.trim()}`,
      'Accept': 'application/json',
    },
  })

  // Check if we got HTML instead of JSON (usually means auth error)
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('text/html')) {
    console.error('Authentication error - received HTML response:', {
      documentId,
      status: response.status,
      contentType
    })
    throw new Error("Authentication failed - please reconnect your Google account")
  }

  // Handle specific error cases
  if (response.status === 401) {
    throw new Error("Token expired or invalid")
  }

  if (response.status === 403) {
    throw new Error("Access denied to document")
  }

  if (!response.ok) {
    const errorText = await response.text()
    let errorData
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { error: errorText }
    }
    
    console.error("Google API Error:", {
      documentId,
      status: response.status,
      statusText: response.statusText,
      errorData
    })
    throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  if (!data?.body?.content) {
    console.warn(`Document ${documentId} has no content`)
    return ""
  }

  // Extract text content from the document
  let content = ""
  for (const element of data.body.content) {
    if (element.paragraph?.elements) {
      for (const paragraphElement of element.paragraph.elements) {
        if (paragraphElement.textRun?.content) {
          content += paragraphElement.textRun.content
        }
      }
    }
  }

  return content
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

export async function getAllDocuments(userId: string): Promise<Document[]> {
  const token = await db.token.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: "google",
      },
    },
  })

  if (!token) {
    throw new Error("Google account not connected")
  }

  let accessToken = token.accessToken

  if (new Date() > token.expiresAt) {
    try {
      const refreshedToken = await refreshToken(token.refreshToken!)
      accessToken = refreshedToken.access_token

      await db.token.update({
        where: { id: token.id },
        data: {
          accessToken: refreshedToken.access_token,
          expiresAt: new Date(Date.now() + refreshedToken.expires_in * 1000),
        },
      })
    } catch (error) {
      console.error("Token refresh failed:", error)
      throw new Error("Failed to refresh access token")
    }
  }

  const searchQuery = `mimeType = 'application/vnd.google-apps.document'`
  const documents: Document[] = []

  try {
    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink,modifiedTime)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch documents list: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    for (const file of data.files) {
      try {
        const docContent = await fetchDocumentContent(file.id, accessToken)
        documents.push({
          id: file.id,
          name: file.name,
          content: docContent,
          url: file.webViewLink,
          lastModified: file.modifiedTime,
        })
      } catch (error) {
        console.error(`Error fetching content for document ${file.id}:`, error)
        // Continue with other documents even if one fails
      }
    }

    return documents

  } catch (error) {
    console.error("Error fetching documents:", error)
    throw error
  }
}

