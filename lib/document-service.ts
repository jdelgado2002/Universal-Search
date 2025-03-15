import { db } from "@/lib/db"

// Google API endpoints
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"
const GOOGLE_DOCS_API = "https://www.googleapis.com/docs/v1"

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
  const response = await fetch(`${GOOGLE_DOCS_API}/documents/${documentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error("Failed to fetch document content")
  }

  const data = await response.json()

  // Extract text content from the document
  let content = ""

  if (data.body && data.body.content) {
    for (const element of data.body.content) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements) {
          if (paragraphElement.textRun && paragraphElement.textRun.content) {
            content += paragraphElement.textRun.content
          }
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

  // Search for all Google Docs files
  const searchQuery = `mimeType = 'application/vnd.google-apps.document'`

  const response = await fetch(
    `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink,modifiedTime)`,
    {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error("Failed to fetch documents")
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

