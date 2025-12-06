"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface UserContext {
  budget?: string;
  occasion?: string;
  recipient_age?: number;
  interests?: string[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your gift finding assistant. Tell me who you're shopping for and I'll help you find the perfect gift! 🎁",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userContext, setUserContext] = useState<UserContext>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [suggestionChips, setSuggestionChips] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Function to render message content with clickable links
  const renderMessageContent = (content: string) => {
    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s)]+)/g;
    const parts = content.split(urlRegex);

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-purple-600 dark:hover:text-purple-400"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent, chipText?: string) => {
    e.preventDefault();
    const userMessage = chipText || input.trim();
    if (!userMessage || isLoading) return;

    setInput("");
    setSuggestionChips([]); // Clear chips when sending a message

    // Add user message to conversation
    const newMessages = [
      ...messages,
      { role: "user" as const, content: userMessage },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    // Extract context from user message
    const updatedContext = { ...userContext };

    // Extract budget
    const budgetMatch =
      userMessage.match(/\$?(\d+)[-–to]+\$?(\d+)/i) ||
      userMessage.match(/budget.*?\$?(\d+)/i);
    if (budgetMatch) {
      updatedContext.budget = budgetMatch[2]
        ? `${budgetMatch[1]}-${budgetMatch[2]}`
        : budgetMatch[1];
    }

    // Extract age
    const ageMatch =
      userMessage.match(/(\d+)\s*(?:year|yr)s?\s*old/i) ||
      userMessage.match(/age.*?(\d+)/i) ||
      userMessage.match(/she'?s\s*(\d+)/i) ||
      userMessage.match(/he'?s\s*(\d+)/i);
    if (ageMatch) {
      updatedContext.recipient_age = parseInt(ageMatch[1]);
    }

    // Extract occasion
    const occasions = [
      "birthday",
      "anniversary",
      "wedding",
      "graduation",
      "christmas",
      "holiday",
      "valentines",
    ];
    occasions.forEach((occasion) => {
      if (userMessage.toLowerCase().includes(occasion)) {
        updatedContext.occasion = occasion;
      }
    });

    // Extract interests (simple keyword detection)
    const interests: string[] = updatedContext.interests || [];
    const interestKeywords = [
      "reading",
      "books",
      "tech",
      "gaming",
      "cooking",
      "fashion",
      "sports",
      "music",
      "art",
      "travel",
      "fitness",
    ];
    interestKeywords.forEach((interest) => {
      if (
        userMessage.toLowerCase().includes(interest) &&
        !interests.includes(interest)
      ) {
        interests.push(interest);
      }
    });
    if (interests.length > 0) {
      updatedContext.interests = interests;
    }

    setUserContext(updatedContext);

    try {
      const response = await fetch(
        "https://gift-finding-chatbot.vercel.app/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userMessage,
            conversation_id: conversationId,
            conversation_history: newMessages,
            user_context: updatedContext,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Store conversation ID for continuity
      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      console.log("response:   ", data.response);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);

      // Set suggestion chips if available
      if (data.suggestion_chips && data.suggestion_chips.length > 0) {
        setSuggestionChips(data.suggestion_chips);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I encountered an error. Please make sure the API is running on http://localhost:8000",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      await fetch("https://gift-finding-chatbot.vercel.app/reset", {
        method: "POST",
      });
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I'm your gift finding assistant. Tell me who you're shopping for and I'll help you find the perfect gift! 🎁",
        },
      ]);
      setUserContext({});
      setConversationId(null);
      setSuggestionChips([]);
      setInput("");
    } catch (error) {
      console.error("Error resetting:", error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 font-sans dark:from-zinc-950 dark:via-black dark:to-purple-950">
      <main className="flex h-screen w-full max-w-4xl flex-col bg-white shadow-2xl dark:bg-zinc-900 sm:h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <span className="text-2xl">🎁</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Gift Finder</h1>
              <p className="text-xs text-white/80">AI-Powered Gift Assistant</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/30"
          >
            New Chat
          </button>
        </div>

        {/* Context Tags */}
        {Object.keys(userContext).length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-zinc-50 px-6 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
            {userContext.budget && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                💰 Budget: ${userContext.budget}
              </span>
            )}
            {userContext.occasion && (
              <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-medium text-pink-700 dark:bg-pink-900/50 dark:text-pink-300">
                🎉{" "}
                {userContext.occasion.charAt(0).toUpperCase() +
                  userContext.occasion.slice(1)}
              </span>
            )}
            {userContext.recipient_age && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                👤 Age: {userContext.recipient_age}
              </span>
            )}
            {userContext.interests && userContext.interests.length > 0 && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/50 dark:text-green-300">
                ❤️ Interests: {userContext.interests.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth">
          <div className="space-y-4 pb-20">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => (
                          <a
                            {...props}
                            className="underline hover:text-purple-600 dark:hover:text-purple-400"
                            target="_blank"
                            rel="noreferrer"
                          />
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600 [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600 [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-purple-600"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion Chips */}
            {suggestionChips.length > 0 && !isLoading && (
              <div className="flex flex-wrap gap-2 justify-start px-2">
                {suggestionChips.map((chip, index) => (
                  <button
                    key={index}
                    onClick={(e) => handleSubmit(e, chip)}
                    className="rounded-full border-2 border-purple-200 bg-white px-4 py-2 text-sm font-medium text-purple-700 transition-all hover:border-purple-400 hover:bg-purple-50 dark:border-purple-800 dark:bg-zinc-900 dark:text-purple-300 dark:hover:border-purple-600 dark:hover:bg-zinc-800"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-500 transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400 dark:focus:border-purple-400"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Powered by Nova 2 Lite via OpenRouter
          </p>
        </div>
      </main>
    </div>
  );
}
