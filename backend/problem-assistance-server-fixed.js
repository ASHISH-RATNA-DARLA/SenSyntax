// ProblemAssistanctServer.js
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
const OLLAMA_API = "http://127.0.0.1:11434/api/generate"
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

// Validate and normalize language
function validateLanguage(language) {
  // Require a language to be provided
  if (!language) {
    console.warn(`No language provided. A language must be specified.`)
    throw new Error("Language parameter is required")
  }

  // Normalize language to lowercase
  const normalizedLang = language.toLowerCase()

  // Check if the language is supported
  if (SUPPORTED_LANGUAGES.includes(normalizedLang)) {
    return normalizedLang
  }

  // If language is not supported, throw an error
  console.warn(`Unsupported language: ${language}. Supported languages are: ${SUPPORTED_LANGUAGES.join(", ")}`)
  throw new Error(`Unsupported language: ${language}`)
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
      return "Unknown Language"
  }
}

// Prepare prompt
function buildPrompt(q, language) {
  // Validate and normalize the language
  const normalizedLang = validateLanguage(language)
  
  // Get the display name for the language
  const langDisplayName = getLanguageDisplayName(normalizedLang)
  
  return `
You are an expert ${langDisplayName} mentor specializing in Data Structures and Algorithms.
Read the following problem carefully and explain it using EXACTLY the following structure with these EXACT section headings:

SECTION 1: Explaining the Problem
- Describe the question in simple layman terms without any technical jargon
- IMPORTANT: Clearly identify and explain the key DSA topics/concepts used in the question (e.g., arrays, linked lists, trees, graphs, sorting, searching, dynamic programming, recursion, etc.)
- Break down the problem into smaller, more manageable parts
- Use beginner-friendly language to describe the key task

SECTION 2: Solution Strategy
- Comprehensively explain the core logic or strategy to solve this problem
- ABSOLUTELY DO NOT provide any code examples, snippets, or implementation details
- Focus on explaining the thought process and algorithmic approach
- Explain WHY this approach works for the problem
- Emphasize the importance of understanding the problem before attempting to write code
- Encourage students to break down complex problems into simpler sub-problems
- Discuss key challenges and how they can be handled in a beginner-friendly way

SECTION 3: Step-by-Step Approach
- List numbered steps that a student should take to solve the problem
- Each step should be a conceptual action, not a coding instruction
- Focus on the algorithm and approach, not the implementation details

CRITICAL INSTRUCTIONS:
1. DO NOT INCLUDE ANY CODE EXAMPLES OR SNIPPETS in your response
2. DO NOT use markdown code blocks (backticks) anywhere in your response
3. DO NOT include variable names, function names, or any syntax specific to ${langDisplayName}
4. Strictly adhere to the given format with these EXACT section headings
5. Only follow the 3 sections above
6. Describe the solution in words only, without showing implementation
7. NEVER include any ${langDisplayName} code, pseudocode, or code-like syntax in your response
8. If you feel tempted to show code, instead describe the algorithm in plain English
9. Focus on explaining the DSA concepts and problem-solving approach

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
    /^def\s+\w+\s*\(.*\):/gm, // Python function definitions
    /^import\s+\w+/gm, // Import statements
    /^from\s+\w+\s+import/gm, // From import statements
    /^class\s+\w+/gm, // Class definitions
    /^if\s+.*:/gm, // If statements
    /^for\s+.*:/gm, // For loops
    /^while\s+.*:/gm, // While loops
    /^return\s+.*/gm, // Return statements
    /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.*/gm, // Variable assignments
    /^function\s+\w+\s*\(.*\)/gm, // JavaScript function declarations
    /^const\s+.*=\s*function/gm, // JavaScript function expressions
    /^let\s+.*=\s*function/gm, // JavaScript function expressions
    /^var\s+.*=\s*function/gm, // JavaScript function expressions
    /^const\s+.*=\s*\(.*\)\s*=>/gm, // JavaScript arrow functions
    /^let\s+.*=\s*\(.*\)\s*=>/gm, // JavaScript arrow functions
    /^var\s+.*=\s*\(.*\)\s*=>/gm, // JavaScript arrow functions
    /^public\s+.*\(/gm, // Java method declarations
    /^private\s+.*\(/gm, // Java method declarations
    /^protected\s+.*\(/gm, // Java method declarations
    /^static\s+.*\(/gm, // Java static method declarations
    /^void\s+\w+\s*\(/gm, // C/C++ function declarations
    /^int\s+\w+\s*\(/gm, // C/C++ function declarations
    /^char\s+\w+\s*\(/gm, // C/C++ function declarations
    /^float\s+\w+\s*\(/gm, // C/C++ function declarations
    /^double\s+\w+\s*\(/gm, // C/C++ function declarations
    /^bool\s+\w+\s*\(/gm, // C/C++ function declarations
    /^#include/gm, // C/C++ include directives
    /^using\s+namespace/gm, // C++ namespace directives
    /^namespace\s+\w+/gm, // C++ namespace declarations
    /^template\s*</gm, // C++ template declarations
    /^printf\s*\(/gm, // C printf statements
    /^cout\s*<</gm, // C++ cout statements
    /^cin\s*>>/gm, // C++ cin statements
    /^System\.out\.println/gm, // Java print statements
    /^System\.out\.print/gm, // Java print statements
    /^console\.log/gm, // JavaScript console.log statements
    /^print\s*\(/gm, // Python print statements
    /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\(/gm, // Method calls
    /^[a-zA-Z_][a-zA-Z0-9_]*\(/gm, // Function calls
  ]

  for (const pattern of codePatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  // Remove any remaining code-like patterns
  cleaned = cleaned.replace(/\[\s*\d+\s*:\s*\d+\s*\]/g, ""); // Array slicing notation
  cleaned = cleaned.replace(/\(\s*\d+\s*,\s*\d+\s*\)/g, ""); // Coordinate pairs
  cleaned = cleaned.replace(/\{\s*\w+\s*:\s*\w+\s*\}/g, ""); // Simple object literals
  
  // Remove lines that are just variable names or function names
  cleaned = cleaned.replace(/^[a-zA-Z_][a-zA-Z0-9_]*$/gm, "");
  
  // Clean up any empty lines created by our replacements
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n");
  
  return cleaned;
}

// Save response to JSON file
function saveResponse(questionIndex, title, responseText, language) {
  try {
    ensureStorageDirectoryExists()

    // Clean the response text to remove any code blocks
    const cleanedResponse = cleanResponseText(responseText)

    const responseData = {
      questionIndex,
      title,
      language: validateLanguage(language),
      response: cleanedResponse,
      timestamp: new Date().toISOString(),
    }

    fs.writeFileSync(RESPONSE_STORAGE_PATH, JSON.stringify(responseData, null, 2), "utf8")
    console.log(`Response for question ${questionIndex} with language ${language} saved to storage`)
    return true
  } catch (error) {
    console.error("Error saving response:", error.message)
    return false
  }
}

// Generate a fallback response when Ollama is unavailable
function generateFallbackResponse(question, language) {
  // Get the display name for the language
  const langDisplayName = getLanguageDisplayName(validateLanguage(language))
  
  return `SECTION 1: Explaining the Problem
- The AI Mentor is not available right now. Please try again later.
- This problem is about ${question.title} with a difficulty of ${question.difficulty}.
- You selected ${langDisplayName} as your programming language.

SECTION 2: Solution Strategy
- While the AI Mentor is unavailable, you can try to solve this problem on your own.
- Read the problem statement carefully and think about the key concepts involved.
- Consider how you would approach this problem using ${langDisplayName}.

SECTION 3: Step-by-Step Approach
1. Read the problem statement and understand the requirements
2. Analyze the sample inputs and outputs
3. Think about potential algorithms or data structures that might help
4. Try to implement a solution in ${langDisplayName} and test it with the sample cases
5. If you're stuck, try again later when the AI Mentor is available`
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
    // Get language from query parameter - it's required
    const language = req.query.language
    
    // Check if language is provided
    if (!language) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Language parameter is required" })}\n\n`)
      return res.end()
    }
    
    try {
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
            model: "llama3",  // Using llama3 for better conceptual explanations
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
    } catch (langError) {
      // Handle language validation errors
      console.error("Language validation error:", langError.message)
      res.write(`event: error\ndata: ${JSON.stringify({ error: langError.message })}\n\n`)
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
    // Get language from query parameter - it's required
    const language = req.query.language
    
    // Check if language is provided
    if (!language) {
      return res.status(400).send("Language parameter is required")
    }
    
    try {
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

        // Create a promise to handle the streaming response
        const responsePromise = new Promise((resolve, reject) => {
          // Make the request with responseType: 'stream'
          axios
            .post(
              OLLAMA_API,
              {
                model: "llama3",  // Using llama3 for better conceptual explanations
                prompt: prompt,
                stream: true,
              },
              {
                headers: { "Content-Type": "application/json" },
                responseType: "stream",
                timeout: 150000, // 5 minute timeout
              },
            )
            .then((response) => {
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
                        process.stdout.write(parsedChunk.response)
                      }
                    }
                  }

                  // Keep the last line in the buffer if it's incomplete
                  jsonBuffer = lines[lines.length - 1]
                } catch (e) {
                  // If we can't parse, just keep accumulating data
                }
              })

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
                  // Ignore parsing errors for the last chunk
                }

                console.log("\nStream ended, total response length:", fullResponse.length)

                // Save the response to storage with language
                saveResponse(index, question.title, fullResponse, normalizedLang)

                // Resolve the promise with the full response
                resolve({
                  title: question.title,
                  language: normalizedLang,
                  languageDisplay: langDisplayName,
                  response: fullResponse,
                })
                resolve()
              })

              response.data.on("error", (err) => {
                console.error("Stream error:", err)
                reject(err)
              })
            })
            .catch(reject)
        })

        // Wait for the response
        const result = await responsePromise
        return res.send(result)
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
    } catch (langError) {
      // Handle language validation errors
      console.error("Language validation error:", langError.message)
      return res.status(400).send(langError.message)
    }
  } catch (err) {
    console.error("Server error:", err.message)
    return res.status(500).send("Server error: " + err.message)
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Health check available at http://localhost:${PORT}/health`)
  console.log(`Response storage path: ${RESPONSE_STORAGE_PATH}`)
})