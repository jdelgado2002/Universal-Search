import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-4xl font-bold mb-8 text-center">API Integration Service</h1>

      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Connect External Services</CardTitle>
            <CardDescription>Connect your Google Docs account to search and access your documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center p-4 border rounded-lg">
              <img src="/placeholder.svg?height=40&width=40" alt="Google Docs" className="mr-4 h-10 w-10" />
              <div className="flex-1">
                <h3 className="font-medium">Google Docs</h3>
                <p className="text-sm text-muted-foreground">Search and access your documents</p>
              </div>
              <Link href="/api/auth/google">
                <Button>Connect</Button>
              </Link>
            </div>

            <div className="flex items-center p-4 border rounded-lg opacity-50">
              <img src="/placeholder.svg?height=40&width=40" alt="Dropbox" className="mr-4 h-10 w-10" />
              <div className="flex-1">
                <h3 className="font-medium">Dropbox</h3>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
              <Button disabled>Connect</Button>
            </div>

            <div className="flex items-center p-4 border rounded-lg opacity-50">
              <img src="/placeholder.svg?height=40&width=40" alt="Notion" className="mr-4 h-10 w-10" />
              <div className="flex-1">
                <h3 className="font-medium">Notion</h3>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
              <Button disabled>Connect</Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <p className="text-sm text-muted-foreground">Connect services to enable document search</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

