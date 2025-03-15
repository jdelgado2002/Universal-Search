"use client"

import { useState, useEffect } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Search, FileText, ExternalLink, LogOut, User } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"

interface Document {
  id: string
  name: string
  url: string
  lastModified: string
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Check if user is authenticated
    if (status === "unauthenticated") {
      router.push("/auth/signin")
    }

    // Check if Google is connected
    const checkGoogleConnection = async () => {
      try {
        const response = await fetch("/api/user/connections")
        const data = await response.json()
        setIsGoogleConnected(data.google || false)
      } catch (error) {
        console.error("Error checking connections:", error)
      }
    }

    if (status === "authenticated") {
      checkGoogleConnection()
    }
  }, [status, router])

  const searchDocuments = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/docs/search?q=${encodeURIComponent(query)}`)

      if (!response.ok) {
        throw new Error("Failed to search documents")
      }

      const data = await response.json()
      setDocuments(data.documents)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search documents. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push("/auth/signin")
  }

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          {session?.user?.name && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{session.user.name}</span>
            </div>
          )}
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {!isGoogleConnected ? (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Connect Google Docs</CardTitle>
            <CardDescription>Connect your Google Docs account to search and access your documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center p-4 border rounded-lg">
              <img src="/placeholder.svg?height=40&width=40" alt="Google Docs" className="mr-4 h-10 w-10" />
              <div className="flex-1">
                <h3 className="font-medium">Google Docs</h3>
                <p className="text-sm text-muted-foreground">Search and access your documents</p>
              </div>
              <Link href="/api/auth/google/connect">
                <Button>Connect</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Search Documents</CardTitle>
              <CardDescription>Search for documents in your Google Docs account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter search query..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchDocuments()}
                />
                <Button onClick={searchDocuments} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {documents.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Search Results</h2>
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center">
                      <FileText className="h-8 w-8 mr-4 text-blue-500" />
                      <div className="flex-1">
                        <h3 className="font-medium">{doc.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          Last modified: {new Date(doc.lastModified).toLocaleDateString()}
                        </p>
                      </div>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {isLoading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="h-8 w-8 animate-spin mb-4" />
                  <p>Searching documents...</p>
                </div>
              ) : (
                <p>Search for documents to see results here</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

