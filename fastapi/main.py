from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIModel
from typing import Optional, List
import os
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client, Client
import uuid

# Load environment variables from .env file
load_dotenv()

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv('SUPABASE_URL', ''),
    os.getenv('SUPABASE_KEY', '')
)

# Initialize FastAPI app
app = FastAPI(
    title="Gift Finding Chatbot",
    description="An AI-powered chatbot to help find the perfect gift",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the message sender (user/assistant)")
    content: str = Field(..., description="Content of the message")

class ChatRequest(BaseModel):
    message: str = Field(..., description="User's message to the chatbot")
    conversation_id: Optional[str] = Field(default=None, description="Unique conversation ID")
    conversation_history: Optional[List[ChatMessage]] = Field(default=[], description="Previous conversation history")
    user_context: Optional[dict] = Field(default={}, description="Additional context like budget, occasion, etc.")

class GiftSuggestion(BaseModel):
    name: str = Field(..., description="Name of the gift")
    description: str = Field(..., description="Description of the gift")
    price_range: str = Field(..., description="Estimated price range")
    why_suitable: str = Field(..., description="Why this gift is suitable")
    where_to_buy: List[str] = Field(default=[], description="Suggested places to buy")

class SuggestionChip(BaseModel):
    text: str = Field(..., description="Quick reply suggestion text")

class ChatResponse(BaseModel):
    response: str = Field(..., description="Chatbot's response")
    conversation_id: str = Field(..., description="Unique conversation ID for continuity")
    suggestions: Optional[List[GiftSuggestion]] = Field(default=None, description="Gift suggestions if applicable")
    suggestion_chips: Optional[List[str]] = Field(default=None, description="Quick reply suggestions")
    follow_up_questions: Optional[List[str]] = Field(default=None, description="Suggested follow-up questions")

# Dependencies for the agent
class GiftFinderDeps(BaseModel):
    conversation_history: List[ChatMessage] = Field(default=[])
    user_context: dict = Field(default={})

# Initialize OpenRouter model through environment variables
# Pydantic AI's OpenAIModel reads from OPENAI_API_KEY and OPENAI_BASE_URL env vars
os.environ['OPENAI_API_KEY'] = os.getenv('OPENROUTER_API_KEY', '')
os.environ['OPENAI_BASE_URL'] = 'https://openrouter.ai/api/v1'

model = OpenAIModel('anthropic/claude-3.5-sonnet')

# Create a suggestion chips agent
suggestion_agent = Agent(
    model=model,
    system_prompt="""You are a helpful assistant that generates quick reply suggestions for a gift-finding conversation.

Based on the current conversation context, generate 3 SHORT, natural quick reply options (max 6 words each) that the user might want to say next.

Examples:
- "Tell me more about that"
- "What about tech gifts?"
- "Something cheaper?"
- "Show me more options"
- "That sounds perfect!"

Return ONLY a JSON array of strings, nothing else. Example: ["Option 1", "Option 2", "Option 3"]""",
)

# Helper functions for Supabase
async def save_message_to_db(conversation_id: str, role: str, content: str, user_context: dict = None):
    """Save a message to Supabase"""
    try:
        data = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "user_context": user_context,
            "timestamp": datetime.now().isoformat()
        }
        supabase.table("messages").insert(data).execute()
    except Exception as e:
        print(f"Error saving message: {e}")

async def get_conversation_history(conversation_id: str) -> List[ChatMessage]:
    """Retrieve conversation history from Supabase"""
    try:
        response = supabase.table("messages")\
            .select("*")\
            .eq("conversation_id", conversation_id)\
            .order("timestamp", desc=False)\
            .execute()
        
        return [ChatMessage(role=msg["role"], content=msg["content"]) for msg in response.data]
    except Exception as e:
        print(f"Error retrieving conversation: {e}")
        return []

async def get_latest_context(conversation_id: str) -> dict:
    """Get the most recent user context from the conversation"""
    try:
        response = supabase.table("messages")\
            .select("user_context")\
            .eq("conversation_id", conversation_id)\
            .not_.is_("user_context", "null")\
            .order("timestamp", desc=True)\
            .limit(1)\
            .execute()
        
        if response.data:
            return response.data[0].get("user_context", {})
        return {}
    except Exception as e:
        print(f"Error retrieving context: {e}")
        return {}
agent = Agent(
    model=model,
    deps_type=GiftFinderDeps,
    system_prompt="""You are an expert gift finder assistant with deep knowledge of gifts across all categories and price ranges. Your role is to help users find the perfect gift by:

1. Asking thoughtful questions about the recipient (age, interests, relationship, occasion)
2. Understanding the user's budget and preferences
3. Providing personalized, creative, and SPECIFIC gift suggestions with actual product names and brands
4. Explaining why each suggestion would be meaningful for that specific person
5. Offering practical advice on where to purchase (specific stores or online retailers)

IMPORTANT: 
- Remember ALL details shared in the conversation (age, interests, budget, occasion, relationship, etc.)
- Reference previous information naturally in your responses
- When you have enough information (recipient details + budget), provide 3-5 SPECIFIC gift recommendations
- Include actual product names, brands, and price estimates
- Be warm, conversational, and helpful
- Ask one question at a time to avoid overwhelming the user

Use your extensive knowledge to suggest real, thoughtful gifts. Don't use generic placeholders.""",
)

@agent.tool
async def search_gift_ideas(ctx: RunContext[GiftFinderDeps], category: str, budget: str) -> str:
    """Search for gift ideas based on category and budget.
    
    Args:
        ctx: The run context
        category: Gift category (e.g., 'tech', 'books', 'experiences')
        budget: Budget range (e.g., 'under-50', '50-100', '100+')
    """
    # Let the model use its knowledge to suggest gifts
    # This tool is available but the model can also suggest gifts directly
    return f"You have extensive knowledge about gifts in the {category} category for {budget} budget range. Use your knowledge to suggest specific, thoughtful gift ideas."

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Gift Finding Chatbot API",
        "version": "1.0.0",
        "endpoints": {
            "/chat": "POST - Send a message to the chatbot",
            "/health": "GET - Check API health"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Main chat endpoint for the gift finding chatbot.
    
    Args:
        request: ChatRequest containing message, history, and context
        
    Returns:
        ChatResponse with bot's reply and optional gift suggestions
    """
    try:
        # Generate or use existing conversation ID
        conversation_id = request.conversation_id or str(uuid.uuid4())
        
        # Load conversation history from Supabase if conversation_id exists
        if request.conversation_id:
            db_history = await get_conversation_history(conversation_id)
            db_context = await get_latest_context(conversation_id)
            # Merge with provided context
            merged_context = {**db_context, **request.user_context}
        else:
            db_history = []
            merged_context = request.user_context
        
        # Use DB history if available, otherwise use provided history
        conversation_history = db_history if db_history else request.conversation_history
        
        # Save user message to Supabase
        await save_message_to_db(conversation_id, "user", request.message, merged_context)
        
        # Prepare dependencies
        deps = GiftFinderDeps(
            conversation_history=conversation_history,
            user_context=merged_context
        )
        
        # Build full context including conversation history
        full_context = ""
        
        # Add conversation history for context
        if conversation_history:
            full_context += "Previous conversation:\n"
            for msg in conversation_history[-6:]:  # Last 6 messages for context
                full_context += f"{msg.role}: {msg.content}\n"
            full_context += "\n"
        
        # Add user context
        if merged_context:
            full_context += f"Known information about the recipient:\n"
            for key, value in merged_context.items():
                full_context += f"- {key}: {value}\n"
            full_context += "\n"
        
        # Add current message
        full_context += f"Current user message: {request.message}"
        
        # Run the main agent
        result = await agent.run(
            full_context, 
            deps=deps, 
            message_history=[],
            model_settings={'max_tokens': 1024}
        )
        
        response_text = str(result.output) if hasattr(result, 'output') else str(result)
        
        # Save assistant response to Supabase
        await save_message_to_db(conversation_id, "assistant", response_text)
        
        # Generate suggestion chips using the second agent
        suggestion_chips = []
        try:
            chip_context = f"Last user message: {request.message}\nAssistant response: {response_text[:200]}..."
            chip_result = await suggestion_agent.run(
                chip_context,
                message_history=[],
                model_settings={'max_tokens': 100}
            )
            chip_output = str(chip_result.output) if hasattr(chip_result, 'output') else str(chip_result)
            
            # Parse JSON array from response
            import json
            chip_output = chip_output.strip()
            # Remove markdown code blocks if present
            if chip_output.startswith('```'):
                chip_output = chip_output.split('```')[1]
                if chip_output.startswith('json'):
                    chip_output = chip_output[4:]
            suggestion_chips = json.loads(chip_output)
        except Exception as e:
            print(f"Error generating suggestion chips: {e}")
            # Fallback suggestions
            suggestion_chips = ["Tell me more", "Show other options", "That works!"]
        
        suggestions = None
        if any(keyword in response_text.lower() for keyword in ['suggest', 'recommend', 'consider', 'gift idea']):
            suggestions = []
        
        # Generate follow-up questions based on context
        follow_ups = []
        if not merged_context.get('budget'):
            follow_ups.append("What's your budget for this gift?")
        if not merged_context.get('occasion'):
            follow_ups.append("What's the occasion?")
        if not merged_context.get('recipient_age'):
            follow_ups.append("How old is the recipient?")
        
        return ChatResponse(
            response=response_text,
            conversation_id=conversation_id,
            suggestions=suggestions,
            suggestion_chips=suggestion_chips[:3] if suggestion_chips else None,
            follow_up_questions=follow_ups[:2] if follow_ups else None
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing chat: {str(e)}")

@app.post("/reset")
async def reset_conversation():
    """Reset the conversation and start fresh"""
    return {
        "message": "Conversation reset successfully",
        "timestamp": datetime.now().isoformat()
    }

# Example usage and setup instructions
"""
To run this API:

1. Install dependencies:
   pip install fastapi uvicorn pydantic-ai httpx openai python-dotenv supabase

2. Set up Supabase:
   - Create a Supabase project at https://supabase.com
   - Create a table called "messages" with columns:
     * id (uuid, primary key, auto-generated)
     * conversation_id (text)
     * role (text)
     * content (text)
     * user_context (jsonb, nullable)
     * timestamp (timestamp with time zone)

3. Set your environment variables in .env:
   OPENROUTER_API_KEY='your-key-here'
   SUPABASE_URL='your-supabase-url'
   SUPABASE_KEY='your-supabase-anon-key'

4. Run the server:
   uvicorn main:app --reload

5. Visit http://localhost:8000/docs for interactive API documentation
"""

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)