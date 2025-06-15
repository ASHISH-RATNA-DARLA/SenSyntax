"use client"

import { Button } from "@/components/ui/button"
import { Alert, AlertCircle, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { RefreshCw, HelpCircle } from "lucide-react"
import type { ProblemAssistance } from "../types"

interface ProblemAssistanceTabProps {
  problemAssistance: ProblemAssistance
  fetchProblemAssistance: (forceRefresh?: boolean) => Promise<void>
  refreshExplanation: () => void
}

export function ProblemAssistanceTab({
  problemAssistance,
  fetchProblemAssistance,
  refreshExplanation,
}: ProblemAssistanceTabProps) {
  if (problemAssistance.isLoading) {
    return (
      <div className="p-2 md:p-4">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-xs md:text-sm">Loading problem assistance...</span>
        </div>

        {problemAssistance.streamingText && (
          <div className="mt-4 p-2 md:p-4 border rounded-md bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">Live response:</p>
            <div className="whitespace-pre-line text-xs md:text-sm">{problemAssistance.streamingText}</div>
          </div>
        )}
      </div>
    )
  }

  if (problemAssistance.error) {
    return (
      <div className="p-2 md:p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="text-xs md:text-sm">{problemAssistance.error}</AlertDescription>
        </Alert>
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => fetchProblemAssistance()} className="text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  if (problemAssistance.explaining || problemAssistance.solution || problemAssistance.stepByStep) {
    return (
      <div className="p-2 md:p-4 space-y-4 md:space-y-6 text-xs md:text-sm">
        <div className="flex justify-between items-center mb-2">
          {problemAssistance.fromCache && (
            <span className="text-xs text-muted-foreground italic">Using cached explanation</span>
          )}
          <Button variant="outline" size="sm" className="ml-auto text-xs" onClick={refreshExplanation}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Refresh
          </Button>
        </div>
        {problemAssistance.explaining && (
          <div>
            <h3 className="font-semibold text-xs md:text-sm mb-2 dark:text-cyan-400">Problem Explanation:</h3>
            <div className="pl-2 whitespace-pre-line text-xs md:text-sm">{problemAssistance.explaining}</div>
          </div>
        )}

        {problemAssistance.solution && (
          <div>
            <h3 className="font-semibold text-xs md:text-sm mb-2 dark:text-cyan-400">DSA Topics Involved:</h3>
            <div className="pl-2 whitespace-pre-line text-xs md:text-sm">{problemAssistance.solution}</div>
          </div>
        )}

        {problemAssistance.stepByStep && (
          <div>
            <h3 className="font-semibold text-xs md:text-sm mb-2 dark:text-cyan-400">Solution Strategy:</h3>
            <div className="pl-2 whitespace-pre-line text-xs md:text-sm">{problemAssistance.stepByStep}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-2 md:p-4 text-center">
      <p className="text-muted-foreground text-xs md:text-sm mb-4">
        Get structured assistance to understand this problem better.
      </p>
      <Button variant="outline" size="sm" onClick={() => fetchProblemAssistance()} className="text-xs">
        <HelpCircle className="h-3 w-3 mr-1" />
        Get Problem Assistance
      </Button>
    </div>
  )
}
