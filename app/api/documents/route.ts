import { NextRequest, NextResponse } from 'next/server'
import { searchDocuments, getAllDocuments } from '@/lib/document-service'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const query = searchParams.get('query')
    
    const documents = query ? 
      await searchDocuments(session.user.id, query) :
      await getAllDocuments(session.user.id)

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Document API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}
