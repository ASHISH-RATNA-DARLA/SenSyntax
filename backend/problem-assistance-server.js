// ProblemAssistanceServer.js
const express = require("express")
const fs = require("fs")
const path = require("path")
const axios = require("axios")
const cors = require("cors")
const app = express()

// Middleware
app.use(express.json())
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
) // Use the cors package with more permissive settings

const PORT = 3005
const OLLAMA_API = process.env.OLLAMA_API_URL || "http://127.0.0.1:11434/api/generate"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "codestral:latest"
const RESPONSE_STORAGE_PATH = path.join(__dirname, "app", "storage", "PAResponse.json")

// Ensure storage directory exists
function ensureStorageDirectoryExists() {
  const storageDir = path.join(__dirname, "app", "storage")
  if (!fs.existsSync(storageDir)) {
    console.log(`Creating storage directory: ${storageDir}`)
    fs.mkdirSync(storageDir, { recursive: true })
  }
}

// Load questions helper function with error handling
function loadQuestions() {
  try {
    // Try multiple paths to find the questions.json file
    const possiblePaths = [
      path.join(__dirname, "..", "app", "dsa-tutor", "questions.json"),
      path.join(__dirname, "app", "dsa-tutor", "questions.json"),
      path.join(__dirname, "questions.json"),
    ]

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        console.log(`Found questions.json at: ${filePath}`)
        const data = fs.readFileSync(filePath, "utf8")
        return JSON.parse(data)
      }
    }

    console.error("Could not find questions.json in any of the expected locations")
    return []
  } catch (error) {
    console.error("Error loading questions:", error.message)
    return []
  }
}

// Add a health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send({
    status: "ok",
    timestamp: new Date().toISOString(),
  })
})

// Supported languages
const SUPPORTED_LANGUAGES = ["python", "javascript", "java", "cpp", "c"]
const DEFAULT_LANGUAGE = "python"

// Validate and normalize language
function validateLanguage(language) {
  // Default to Python if no language is provided
  if (!language) return DEFAULT_LANGUAGE

  // Normalize language to lowercase
  const normalizedLang = language.toLowerCase()

  // Check if the language is supported
  if (SUPPORTED_LANGUAGES.includes(normalizedLang)) {
    return normalizedLang
  }

  // Default to Python if language is not supported
  console.warn(`Unsupported language: ${language}. Defaulting to ${DEFAULT_LANGUAGE}`)
  return DEFAULT_LANGUAGE
}

// Get language display name
function getLanguageDisplayName(language) {
  switch (language) {
    case "python":
      return "Python"
    case "javascript":
      return "JavaScript"
    case "java":
      return "Java"
    case "cpp":
      return "C++"
    case "c":
      return "C"
    default:
      return "Python"
  }
}

// Get language-specific context for problem explanation
function getLanguageSpecificContext(language) {
  switch (language) {
    case "python":
      return `
- Focus on Python-specific approaches and considerations
- Consider Python's built-in data structures like lists, dictionaries, sets, and tuples
- Think about Python's standard library modules that might be helpful
- Consider Python's strengths in readability and simplicity
- Remember Python's zero-indexed collections and slicing capabilities
      `.trim()

    case "javascript":
      return `
- Focus on JavaScript-specific approaches and considerations
- Consider JavaScript's array methods and object manipulation techniques
- Think about JavaScript's functional programming capabilities
- Consider JavaScript's asynchronous programming model if relevant
- Remember JavaScript's zero-indexed arrays and object property access
      `.trim()

    case "java":
      return `
- Focus on Java-specific approaches and considerations
- Consider Java's collection framework (ArrayList, HashMap, etc.)
- Think about Java's object-oriented design principles
- Consider Java's type system and how it affects the solution
- Remember Java's zero-indexed arrays and explicit type declarations
      `.trim()

    case "cpp":
      return `
- Focus on C++-specific approaches and considerations
- Consider C++'s STL containers and algorithms
- Think about memory management and efficiency
- Consider C++'s template system for generic programming
- Remember C++'s zero-indexed arrays and pointer arithmetic
      `.trim()

    case "c":
      return `
- Focus on C-specific approaches and considerations
- Consider C's standard library functions
- Think about manual memory management and efficiency
- Consider C's procedural programming paradigm
- Remember C's zero-indexed arrays and pointer arithmetic
      `.trim()

    default:
      return ""
  }
}

// Prepare prompt
function buildPrompt(q, language = DEFAULT_LANGUAGE) {
  // Validate and normalize the language
  const normalizedLang = validateLanguage(language)
  
  // Get the display name for the language
  const langDisplayName = getLanguageDisplayName(normalizedLang)
  
  // Get language-specific context
  const languageContext = getLanguageSpecificContext(normalizedLang)
  
  return `
You are an expert ${langDisplayName} mentor.
Read the following problem carefully and explain it using EXACTLY the following structure with these EXACT section headings:

SECTION 1: Explaining the Problem
- Provide a detailed explanation of the problem at a layman level
- Break down the problem into smaller parts using simple, everyday language
- Explain what the problem is asking for and what a solution should accomplish
- Use concrete examples to illustrate the problem, including the provided sample inputs/outputs
- Make sure a complete beginner can understand what needs to be done

SECTION 2: DSA Topics Involved
- Identify ALL the key Data Structures and Algorithms (DSA) topics involved in this problem
- List each DSA topic as a bullet point (e.g., Stack, Queue, Binary Search, Dynamic Programming)
- For each DSA topic mentioned, provide a simple explanation of what it is and how it works
- Explain why this DSA topic is relevant to solving this particular problem
- Use analogies and real-world examples to explain complex DSA concepts

SECTION 3: Solution Strategy
- Provide a single, clear solution strategy based on ${langDisplayName}
- Explain the approach step-by-step in a logical order
- Focus on the thought process and reasoning behind each step
- Mention ${langDisplayName}-specific considerations:
${languageContext}
- Number each step clearly (1, 2, 3, etc.)
- Explain the time and space complexity of the solution in simple terms

CRITICAL INSTRUCTIONS:
1. DO NOT INCLUDE ANY CODE EXAMPLES OR SNIPPETS in your response
2. DO NOT use markdown code blocks (backticks) anywhere in your response
3. Strictly adhere to the given format with these EXACT section headings
4. Only follow the 3 sections above
5. Describe the solution in words only, without showing implementation
6. NEVER include any ${langDisplayName} code, pseudocode, or code-like syntax in your response
7. If you feel tempted to show code, instead describe the algorithm in plain English
8. Make sure your explanations are accessible to beginners with no prior DSA knowledge
Problem Title:
${q.title}
Difficulty:
${q.difficulty}
Problem Statement:
${q.question}
Input Format:
${q.input_format}
Output Format:
${q.output_format}
Constraints:
${q.constraints}
Hint:
${q.hint}
Sample Input:
${q.sample_input}
Sample Output:
${q.sample_output}
Selected Language:
${langDisplayName}
`
}

// Load stored response from JSON file
function loadStoredResponse() {
  try {
    ensureStorageDirectoryExists()
    if (fs.existsSync(RESPONSE_STORAGE_PATH)) {
      const data = fs.readFileSync(RESPONSE_STORAGE_PATH, "utf8")
      return JSON.parse(data)
    }
    return null
  } catch (error) {
    console.error("Error loading stored response:", error.message)
    return null
  }
}

// Function to clean response text and remove any code blocks
function cleanResponseText(text) {
  // Remove any markdown code blocks (\`\`\`...\`\`\`)
  let cleaned = text.replace(/```[\s\S]*?```/g, "")

  // Remove any inline code blocks (`...`)
  cleaned = cleaned.replace(/`[^`]*`/g, "")

  // Remove any lines that look like code (indented by 2+ spaces or tabs and contain common code patterns)
  const codePatterns = [
    /^\s{2,}.*[;{}=()].*$/gm, // Lines with 2+ spaces that contain code symbols
    /^\t+.*[;{}=()].*$/gm, // Lines with tabs that contain code symbols
    /^def\s+\w+\s*$$.*$$:/gm, // Python function definitions
    /^import\s+\w+/gm, // Import statements
    /^from\s+\w+\s+import/gm, // From import statements
    /^class\s+\w+/gm, // Class definitions
    /^if\s+.*:/gm, // If statements
    /^for\s+.*:/gm, // For loops
    /^while\s+.*:/gm, // While loops
    /^return\s+.*/gm, // Return statements
    /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.*/gm, // Variable assignments
  ]

  for (const pattern of codePatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  return cleaned
}

// Save response to JSON file
function saveResponse(questionIndex, title, responseText, language = DEFAULT_LANGUAGE) {
  try {
    ensureStorageDirectoryExists()

    // Clean the response text to remove any code blocks
    const cleanedResponse = cleanResponseText(responseText)

    // Validate and normalize the language
    const normalizedLang = validateLanguage(language)
    
    // Get the display name for the language
    const langDisplayName = getLanguageDisplayName(normalizedLang)

    const responseData = {
      questionIndex,
      title,
      language: normalizedLang,
      languageDisplay: langDisplayName,
      response: cleanedResponse,
      timestamp: new Date().toISOString(),
    }

    fs.writeFileSync(RESPONSE_STORAGE_PATH, JSON.stringify(responseData, null, 2), "utf8")
    console.log(`Response for question ${questionIndex} with language ${langDisplayName} saved to storage`)
    return true
  } catch (error) {
    console.error("Error saving response:", error.message)
    return false
  }
}

// Generate a fallback response when Ollama is unavailable
function generateFallbackResponse(question, language = DEFAULT_LANGUAGE) {
  // Validate and normalize the language
  const normalizedLang = validateLanguage(language)
  
  // Get the display name for the language
  const langDisplayName = getLanguageDisplayName(normalizedLang)
  
  // Get language-specific context
  const languageContext = getLanguageSpecificContext(normalizedLang)
  
  return `SECTION 1: Explaining the Problem
- The AI Mentor is not available right now. Please try again later.
- This problem is about ${question.title} with a difficulty of ${question.difficulty}.
- You selected ${langDisplayName} as your programming language.
- When the AI Mentor is available, it will provide a detailed explanation of this problem at a layman level.

SECTION 2: DSA Topics Involved
- When the AI Mentor is available, it will identify the key Data Structures and Algorithms (DSA) topics involved in this problem.
- It will explain each DSA topic in simple terms with examples.
- Common DSA topics include arrays, linked lists, stacks, queues, trees, graphs, sorting algorithms, searching algorithms, and dynamic programming.
- Understanding the relevant DSA topics is crucial for developing an effective solution strategy.

SECTION 3: Solution Strategy
1. Read the problem statement and understand the requirements
2. Analyze the sample inputs and outputs
3. Think about potential algorithms or data structures that might help
4. Consider ${langDisplayName}-specific libraries or features that could be useful
5. Plan your solution with ${langDisplayName} in mind
6. Try to implement a solution in ${langDisplayName} and test it with the sample cases
7. If you're stuck, try again later when the AI Mentor is available

When the AI Mentor is available, it will provide ${langDisplayName}-specific guidance for this problem, including:
${languageContext}`
}

// NEW: Server-Sent Events endpoint for streaming responses
app.get("/explain-stream", async (req, res) => {
  try {
    // Set headers for SSE
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    // Load the latest questions data on each request
    const questions = loadQuestions()

    if (questions.length === 0) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Failed to load questions data" })}\n\n`)
      return res.end()
    }

    // Get question index from query parameter or default to 0
    const index = req.query.index ? Number.parseInt(req.query.index) : 0
    // Check if refresh is requested
    const forceRefresh = req.query.refresh === "true"
    // Get language from query parameter or default to python
    const language = req.query.language ? req.query.language : DEFAULT_LANGUAGE
    console.log(`Raw language parameter received: "${language}"`)
    // Validate and normalize the language
    const normalizedLang = validateLanguage(language)
    // Get the display name for the language
    const langDisplayName = getLanguageDisplayName(normalizedLang)

    console.log(
      `Requested streaming for question index: ${index}, Language: ${langDisplayName}, Total questions: ${questions.length}, Force refresh: ${forceRefresh}`,
    )

    const question = questions[index]

    if (!question) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: `Question not found at index ${index}` })}\n\n`)
      return res.end()
    }

    // Check if we have a stored response for this question
    const storedResponse = loadStoredResponse()

    // If we have a stored response for this exact question index and language, and no refresh is requested, return it
    if (!forceRefresh && storedResponse && storedResponse.questionIndex === index && 
        storedResponse.language === normalizedLang) {
      console.log(`Using stored response for question index ${index} with language ${langDisplayName}`)

      // Send initial metadata
      res.write(
        `event: metadata\ndata: ${JSON.stringify({
          title: question.title,
          language: normalizedLang,
          languageDisplay: langDisplayName,
          fromCache: true,
        })}\n\n`,
      )

      // Send the full cached response
      res.write(`event: data\ndata: ${JSON.stringify({ text: storedResponse.response })}\n\n`)

      // Send completion event
      res.write(`event: complete\ndata: ${JSON.stringify({ complete: true })}\n\n`)

      return res.end()
    }

    // Otherwise, generate a new response
    const prompt = buildPrompt(question, normalizedLang)

    try {
      // Send initial metadata
      res.write(
        `event: metadata\ndata: ${JSON.stringify({
          title: question.title,
          language: normalizedLang,
          languageDisplay: langDisplayName,
          fromCache: false,
        })}\n\n`,
      )

      // Make the request with responseType: 'stream'
      const response = await axios.post(
        OLLAMA_API,
        {
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: true,
        },
        {
          headers: { "Content-Type": "application/json" },
          responseType: "stream",
          timeout: 150000, // 5 minute timeout
        },
      )

      let fullResponse = ""
      let jsonBuffer = ""

      // Handle the streaming response
      response.data.on("data", (chunk) => {
        const chunkStr = chunk.toString()
        jsonBuffer += chunkStr

        // Process complete JSON objects
        try {
          // Split by newlines to handle multiple JSON objects in the buffer
          const lines = jsonBuffer.split("\n")

          // Process all complete lines except possibly the last one
          for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].trim()) {
              const parsedChunk = JSON.parse(lines[i])
              if (parsedChunk.response) {
                fullResponse += parsedChunk.response

                // Send the chunk to the client
                res.write(`event: data\ndata: ${JSON.stringify({ text: parsedChunk.response })}\n\n`)

                // Optionally log progress
                process.stdout.write(parsedChunk.response)
              }
            }
          }

          // Keep the last line in the buffer if it's incomplete
          jsonBuffer = lines[lines.length - 1]
        } catch (e) {
          // If we can't parse, just keep accumulating data
          console.log("Error parsing chunk, continuing to accumulate data")
        }
      })

      response.data.on("end", () => {
        // Process any remaining data in the buffer
        try {
          if (jsonBuffer.trim()) {
            const parsedChunk = JSON.parse(jsonBuffer)
            if (parsedChunk.response) {
              fullResponse += parsedChunk.response

              // Send the final chunk
              res.write(`event: data\ndata: ${JSON.stringify({ text: parsedChunk.response })}\n\n`)
            }
          }
        } catch (e) {
          console.log("Error parsing final chunk")
        }

        console.log("\nStream ended, total response length:", fullResponse.length)

        // Save the response to storage with language
        saveResponse(index, question.title, fullResponse, normalizedLang)

        // Send completion event
        res.write(`event: complete\ndata: ${JSON.stringify({ complete: true })}\n\n`)

        res.end()
      })

      response.data.on("error", (err) => {
        console.error("Stream error:", err)
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
        res.end()
      })
    } catch (apiError) {
      console.error("Ollama API error:", apiError.message)

      // Provide a fallback response instead of an error with language
      const fallbackResponse = generateFallbackResponse(question, normalizedLang)

      // Save the fallback response to storage with language
      saveResponse(index, question.title, fallbackResponse, normalizedLang)

      // Send the fallback response
      res.write(`event: data\ndata: ${JSON.stringify({ text: fallbackResponse, fallback: true })}\n\n`)

      // Send completion event
      res.write(`event: complete\ndata: ${JSON.stringify({ complete: true })}\n\n`)

      res.end()
    }
  } catch (err) {
    console.error("Server error:", err.message)
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

// Keep the original endpoint for backward compatibility
app.get("/explain", async (req, res) => {
  try {
    // Load the latest questions data on each request
    const questions = loadQuestions()

    if (questions.length === 0) {
      return res.status(500).send("Failed to load questions data")
    }

    // Get question index from query parameter or default to 0
    const index = req.query.index ? Number.parseInt(req.query.index) : 0
    // Check if refresh is requested
    const forceRefresh = req.query.refresh === "true"
    // Get language from query parameter or default to python
    const language = req.query.language ? req.query.language : DEFAULT_LANGUAGE
    // Validate and normalize the language
    const normalizedLang = validateLanguage(language)
    // Get the display name for the language
    const langDisplayName = getLanguageDisplayName(normalizedLang)

    console.log(
      `Requested question index: ${index}, Language: ${langDisplayName}, Total questions: ${questions.length}, Force refresh: ${forceRefresh}`,
    )

    const question = questions[index]

    if (!question) {
      return res.status(404).send(`Question not found at index ${index}. Total questions: ${questions.length}`)
    }

    // Check if we have a stored response for this question
    const storedResponse = loadStoredResponse()

    // If we have a stored response for this exact question index and language, and no refresh is requested, return it
    if (!forceRefresh && storedResponse && storedResponse.questionIndex === index && 
        storedResponse.language === normalizedLang) {
      console.log(`Using stored response for question index ${index} with language ${langDisplayName}`)
      return res.send({
        title: question.title,
        language: normalizedLang,
        languageDisplay: langDisplayName,
        response: storedResponse.response,
        fromCache: true, // Flag to indicate this is a cached response
      })
    }

    // Otherwise, generate a new response
    const prompt = buildPrompt(question, normalizedLang)

    try {
      // Get streaming response from Ollama
      console.log("Requesting streaming response from Ollama...")

      // Make the request with responseType: 'stream'
      const response = await axios.post(
        OLLAMA_API,
        {
          model: OLLAMA_MODEL,
          prompt: prompt,
          stream: true,
        },
        {
          headers: { "Content-Type": "application/json" },
          responseType: "stream",
          timeout: 150000, // 5 minute timeout
        },
      )

      let fullResponse = ""
      let jsonBuffer = ""

      // Handle the streaming response
      response.data.on("data", (chunk) => {
        const chunkStr = chunk.toString()
        jsonBuffer += chunkStr

        // Process complete JSON objects
        try {
          // Split by newlines to handle multiple JSON objects in the buffer
          const lines = jsonBuffer.split("\n")

          // Process all complete lines except possibly the last one
          for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].trim()) {
              const parsedChunk = JSON.parse(lines[i])
              if (parsedChunk.response) {
                fullResponse += parsedChunk.response
                // Optionally log progress
                process.stdout.write(parsedChunk.response)
              }
            }
          }

          // Keep the last line in the buffer if it's incomplete
          jsonBuffer = lines[lines.length - 1]
        } catch (e) {
          // If we can't parse, just keep accumulating data
          console.log("Error parsing chunk, continuing to accumulate data")
        }
      })

      return new Promise((resolve, reject) => {
        response.data.on("end", () => {
          // Process any remaining data in the buffer
          try {
            if (jsonBuffer.trim()) {
              const parsedChunk = JSON.parse(jsonBuffer)
              if (parsedChunk.response) {
                fullResponse += parsedChunk.response
              }
            }
          } catch (e) {
            console.log("Error parsing final chunk")
          }

          console.log("\nStream ended, total response length:", fullResponse.length)
          console.log("Received complete response from Ollama")

          // Save the response to storage
          saveResponse(index, question.title, fullResponse)

          res.send({
            title: question.title,
            response: fullResponse,
          })
          resolve()
        })

        response.data.on("error", (err) => {
          console.error("Stream error:", err)
          reject(err)
        })
      })
    } catch (apiError) {
      console.error("Ollama API error:", apiError.message)

      // Provide a fallback response instead of an error with language
      const fallbackResponse = generateFallbackResponse(question, normalizedLang)

      // Save the fallback response to storage with language
      saveResponse(index, question.title, fallbackResponse, normalizedLang)

      res.send({
        title: question.title,
        language: normalizedLang,
        languageDisplay: langDisplayName,
        response: fallbackResponse,
        fallback: true, // Flag to indicate this is a fallback response
      })
    }
  } catch (err) {
    console.error("Server error:", err.message)
    res.status(500).send(`Server error: ${err.message}`)
  }
})

// Add an endpoint to clear the cached response
app.delete("/clear-cache", (req, res) => {
  try {
    if (fs.existsSync(RESPONSE_STORAGE_PATH)) {
      // Reset the response file to empty state
      const emptyResponse = {
        questionIndex: -1,
        title: "",
        language: DEFAULT_LANGUAGE,
        languageDisplay: getLanguageDisplayName(DEFAULT_LANGUAGE),
        response: "",
        timestamp: new Date().toISOString(),
      }

      fs.writeFileSync(RESPONSE_STORAGE_PATH, JSON.stringify(emptyResponse, null, 2), "utf8")
      res.status(200).send({ message: "Response cache cleared successfully" })
    } else {
      res.status(404).send({ message: "No cache file found" })
    }
  } catch (error) {
    console.error("Error clearing cache:", error.message)
    res.status(500).send({ error: `Failed to clear cache: ${error.message}` })
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Health check available at http://localhost:${PORT}/health`)
  console.log(`Response storage path: ${RESPONSE_STORAGE_PATH}`)

  // Ensure storage directory exists on startup
  ensureStorageDirectoryExists()
})
