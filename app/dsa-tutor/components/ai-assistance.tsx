"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { FileCode, Code, Bug, RefreshCw, Copy, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface AIAssistanceTabProps {
  currentQuestionIndex: number
  selectedLanguage: any
  setCode: (code: string) => void
}

export function AIAssistanceTab({ currentQuestionIndex, selectedLanguage, setCode }: AIAssistanceTabProps) {
  const [responseContent, setResponseContent] = useState("")
  const [streamingContent, setStreamingContent] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [activeButton, setActiveButton] = useState<"generation" | "explanation" | "bugfix" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [serverStatus, setServerStatus] = useState<"unknown" | "online" | "offline">("unknown")

  // Cleanup function for EventSource
  useEffect(() => {
    const eventSource: EventSource | null = null

    // Return cleanup function
    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  // Check server status on component mount
  useEffect(() => {
    checkServerStatus()
  }, [])

  // Function to check if the server is running
  const checkServerStatus = async () => {
    try {
      const response = await fetch("http://localhost:3004/health", {
        method: "GET",
        headers: { Accept: "application/json" },
        // Add a timeout to the fetch request
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        setServerStatus("online")
        console.log("Code generation server is online")
      } else {
        setServerStatus("offline")
        console.error("Code generation server returned an error")
      }
    } catch (err) {
      setServerStatus("offline")
      console.error("Failed to connect to code generation server:", err)
    }
  }

  // Function to handle code generation
  const handleCodeGeneration = async () => {
    // If server is offline, try to check status first
    if (serverStatus === "offline") {
      await checkServerStatus()

      // If still offline, show error
      if (serverStatus === "offline") {
        setError("Code generation server is offline. Please start the server and try again.")
        return
      }
    }

    setIsLoading(true)
    setActiveButton("generation")
    setError(null)
    setStreamingContent("")
    setResponseContent("")
    setFromCache(false)

    try {
      // Create the URL for the SSE endpoint
      console.log("Selected language object:", selectedLanguage)
      const url = `http://localhost:3004/generate-stream?index=${currentQuestionIndex}&language=${selectedLanguage.name}`
      console.log(`Requesting code generation from: ${url}`)

      // Create an EventSource for SSE
      const eventSource = new EventSource(url)

      // Add a timeout to handle connection issues
      const connectionTimeout = setTimeout(() => {
        if (eventSource.readyState !== EventSource.OPEN) {
          console.error("Connection timeout - could not connect to code generation server")
          setError(
            "Connection timeout - could not connect to code generation server. Please check if the server is running.",
          )
          setIsLoading(false)
          eventSource.close()
        }
      }, 5000) // 5 second timeout

      let accumulatedCode = ""

      // Handle metadata event
      eventSource.addEventListener("metadata", (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("Received metadata:", data)

          // Update fromCache status
          setFromCache(data.fromCache || false)
        } catch (error) {
          console.error("Error parsing metadata:", error)
        }
      })

      // Handle data chunks
      eventSource.addEventListener("data", (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.code) {
            // Accumulate the code
            accumulatedCode += data.code

            // Update the streaming content in the UI
            setStreamingContent(accumulatedCode)
          }
        } catch (error) {
          console.error("Error parsing data chunk:", error)
        }
      })

      // Handle completion
      eventSource.addEventListener("complete", (event) => {
        try {
          console.log("Stream complete")
          clearTimeout(connectionTimeout) // Clear the timeout

          // Update the final state
          setResponseContent(accumulatedCode)
          setStreamingContent("")
          setIsLoading(false)

          // Close the event source
          eventSource.close()
        } catch (error) {
          console.error("Error handling completion:", error)
        }
      })

      // Handle errors
      eventSource.addEventListener("error", (event) => {
        // Create a more descriptive error message
        let errorMessage = "Error connecting to code generation server. "

        if (event.target && (event.target as EventSource).readyState === EventSource.CLOSED) {
          errorMessage += "Connection was closed. "
        } else if (event.target && (event.target as EventSource).readyState === EventSource.CONNECTING) {
          errorMessage += "Attempting to reconnect. "
        }

        errorMessage += "Please check if the server is running and try again."

        console.error("SSE Error:", errorMessage)
        clearTimeout(connectionTimeout) // Clear the timeout

        setError(errorMessage)
        setIsLoading(false)
        setStreamingContent("")
        setServerStatus("offline")

        // Close the event source
        eventSource.close()
      })
    } catch (err) {
      console.error("Error setting up SSE:", err)
      setError(err instanceof Error ? err.message : "Error setting up streaming connection")
      setIsLoading(false)
      setStreamingContent("")
      setServerStatus("offline")
    }
  }

  // Function to handle code explanation
  const handleCodeExplanation = async () => {
    setIsLoading(true)
    setActiveButton("explanation")
    setError(null)

    // This would be implemented when the code explanation server is ready
    try {
      // Placeholder for future implementation
      setResponseContent("Code explanation feature will be implemented soon.")
    } catch (err) {
      console.error("Error explaining code:", err)
      setError(err instanceof Error ? err.message : "Failed to explain code")
      setResponseContent("")
    } finally {
      setIsLoading(false)
    }
  }

  // Function to handle bug fixing
  const handleBugFixing = async () => {
    setIsLoading(true)
    setActiveButton("bugfix")
    setError(null)

    // This would be implemented when the bug fixing server is ready
    try {
      // Placeholder for future implementation
      setResponseContent("Bug fixing feature will be implemented soon.")
    } catch (err) {
      console.error("Error fixing bugs:", err)
      setError(err instanceof Error ? err.message : "Failed to fix bugs")
      setResponseContent("")
    } finally {
      setIsLoading(false)
    }
  }

  // Function to apply generated code to the code playground
  const applyToCodePlayground = () => {
    if ((responseContent || streamingContent) && activeButton === "generation") {
      setCode(responseContent || streamingContent)
    }
  }

  // Function to test the SSE connection
  const handleTestConnection = async () => {
    setIsLoading(true)
    setActiveButton("test")
    setError(null)
    setStreamingContent("")
    setResponseContent("")
    setFromCache(false)

    try {
      // Create the URL for the test SSE endpoint
      const url = `http://localhost:3004/health`
      console.log(`Testing connection to: ${url}`)

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      })

      if (response.ok) {
        setServerStatus("online")
        setResponseContent("Server connection successful! You can now use code generation.")
      } else {
        setServerStatus("offline")
        setError("Server returned an error. Please check if the server is running correctly.")
      }
    } catch (err) {
      console.error("Error testing connection:", err)
      setServerStatus("offline")
      setError("Could not connect to the server. Please make sure the code generation server is running.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {serverStatus === "offline" && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <AlertDescription>Code generation server is offline. Please start the server and try again.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Button
          variant={activeButton === "generation" ? "default" : "outline"}
          className="flex items-center justify-center"
          onClick={handleCodeGeneration}
          disabled={isLoading}
        >
          <FileCode className="h-4 w-4 mr-2" />
          Code Generation
        </Button>

        <Button
          variant={activeButton === "explanation" ? "default" : "outline"}
          className="flex items-center justify-center"
          onClick={handleCodeExplanation}
          disabled={isLoading}
        >
          <Code className="h-4 w-4 mr-2" />
          Code Explanation
        </Button>

        <Button
          variant={activeButton === "bugfix" ? "default" : "outline"}
          className="flex items-center justify-center"
          onClick={handleBugFixing}
          disabled={isLoading}
        >
          <Bug className="h-4 w-4 mr-2" />
          Bug Fixing
        </Button>
      </div>

      {serverStatus === "offline" && (
        <Button variant="outline" size="sm" className="mb-4 w-full" onClick={handleTestConnection} disabled={isLoading}>
          Test Server Connection
        </Button>
      )}

      <div className="flex-1 bg-muted/30 rounded-md p-4 overflow-auto relative">
        {isLoading ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {activeButton === "generation"
                  ? "Generating code..."
                  : activeButton === "explanation"
                    ? "Explaining code..."
                    : "Fixing bugs..."}
              </span>
            </div>

            {streamingContent && (
              <div className="flex-1 overflow-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm p-4 bg-muted rounded-md">{streamingContent}</pre>
              </div>
            )}
          </div>
        ) : error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : responseContent ? (
          <div className="flex flex-col h-full">
            {fromCache && <p className="text-xs text-muted-foreground italic mb-2">Using cached response</p>}
            <div className="flex-1 overflow-auto">
              <pre className="whitespace-pre-wrap font-mono text-sm p-4 bg-muted rounded-md">{responseContent}</pre>
            </div>

            {activeButton === "generation" && (
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={applyToCodePlayground} className="flex items-center gap-1">
                  <Copy className="h-3 w-3" />
                  Apply to Code Playground
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-muted-foreground text-center h-full flex items-center justify-center">
            {activeButton
              ? "No content to display. Try again or select a different option."
              : "Select an option above to get AI assistance"}
          </div>
        )}
      </div>
    </div>
  )
}
