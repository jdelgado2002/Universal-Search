import { db } from "@/lib/db"
import { google } from 'googleapis'
import pdfParse from 'pdf-parse'

// Debug configuration
const DEBUG = process.env.NODE_ENV !== 'production'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

// Logging utility
const log = {
  debug: (...args: any[]) => DEBUG && console.log('[Debug]', ...args),
  error: (...args: any[]) => console.error('[Error]', ...args),
  timing: (label: string, startTime: number) => DEBUG && 
    console.log(`[Timing] ${label}: ${Date.now() - startTime}ms`)
}

// Google API endpoints
const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"

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
  const searchQuery = `name contains '${query}'`

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

const SUPPORTED_MIME_TYPES = {
  'application/vnd.google-apps.document': 'googleDoc',
  'application/vnd.google-apps.spreadsheet': 'googleSheet',
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word'
} as const;

type SupportedMimeType = keyof typeof SUPPORTED_MIME_TYPES;

async function fetchDocumentContent(documentId: string, accessToken: string): Promise<string> {
  const startTime = Date.now()
  log.debug(`Fetching document ${documentId}`)

  if (!accessToken?.trim()) {
    throw new Error("Invalid access token")
  }

  // Initialize Google APIs
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken.trim() })
  
  const drive = google.drive({ version: 'v3', auth })
  const docs = google.docs({ version: 'v1', auth })
  const sheets = google.sheets({ version: 'v4', auth })

  try {
    // Get file metadata
    log.debug('Fetching file metadata')
    const file = await drive.files.get({
      fileId: documentId,
      fields: 'mimeType,name'
    })

    const { mimeType, name } = file.data
    log.debug(`Document type: ${mimeType}, name: ${name}`)
    
    let content = '';
    const docType = SUPPORTED_MIME_TYPES[mimeType as SupportedMimeType]
    
    log.debug(`Processing ${docType || 'unknown'} document type`)

    switch (docType) {
      case 'googleDoc': {
        log.debug('Fetching Google Doc content')
        const doc = await docs.documents.get({ documentId })
        content = extractTextFromDoc(doc.data.body?.content || [])
        log.debug(`Extracted ${content.length} characters from Google Doc`)
        break
      }

      case 'googleSheet': {
        log.debug('Fetching Google Sheet content')
        const sheet = await sheets.spreadsheets.get({
          spreadsheetId: documentId,
          ranges: [],
          includeGridData: true
        })
        content = extractTextFromSheet(sheet.data.sheets || [])
        log.debug(`Extracted ${content.length} characters from Sheet`)
        break
      }

      case 'pdf': {
        log.debug('Fetching PDF content')
        const pdfFile = await drive.files.get(
          { fileId: documentId, alt: 'media' },
          { responseType: 'arraybuffer' }
        )
        const pdfData = await pdfParse(pdfFile.data)
        content = pdfData.text
        log.debug(`Extracted ${content.length} characters from PDF`)
        break
      }

      case 'text': {
        log.debug('Fetching text file content')
        const textFile = await drive.files.get(
          { fileId: documentId, alt: 'media' },
          { responseType: 'text' }
        )
        content = String(textFile.data)
        log.debug(`Extracted ${content.length} characters from text file`)
        break
      }

      case 'word': {
        log.debug('Exporting Word document')
        const exported = await drive.files.export({
          fileId: documentId,
          mimeType: 'text/plain'
        }, {
          responseType: 'text'
        })
        content = String(exported.data)
        log.debug(`Extracted ${content.length} characters from Word doc`)
        break
      }

      default: {
        log.debug(`Unsupported file type: ${mimeType}`)
        return `[Unsupported file type: ${mimeType}]`
      }
    }

    log.timing('Document processing', startTime)
    return content || `[No content available in ${name}]`

  } catch (error: any) {
    log.error(`Error processing document ${documentId}:`, {
      error: error.message,
      code: error.code,
      status: error.status,
      details: error.details || error.response?.data
    })
    
    // Retry on specific errors
    if (error.code === 429 || error.code === 503) {
      log.debug('Rate limited or service unavailable, retrying...')
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return fetchDocumentContent(documentId, accessToken)
    }

    return `[Error processing document: ${error.message}]`
  }
}

function extractTextFromDoc(content: any[]): string {
  let text = ""
  
  for (const element of content) {
    if (element.paragraph?.elements) {
      for (const paragraphElement of element.paragraph.elements) {
        if (paragraphElement.textRun?.content) {
          text += paragraphElement.textRun.content
        }
      }
    }
  }
  
  return text
}

function extractTextFromSheet(sheets: any[]): string {
  let text = ""
  
  for (const sheet of sheets) {
    if (sheet.data?.[0]?.rowData) {
      for (const row of sheet.data[0].rowData) {
        if (row.values) {
          const rowText = row.values
            .map(cell => cell.formattedValue || '')
            .filter(Boolean)
            .join('\t')
          if (rowText) {
            text += rowText + '\n'
          }
        }
      }
    }
  }
  
  return text
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

  const searchQuery = ``
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

