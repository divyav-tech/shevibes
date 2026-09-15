import os
import json
import logging
from dotenv import load_dotenv

# Load env variables from root and backend .env if available
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger = logging.getLogger(__name__)

class CampusAI:
    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key and api_key.strip():
            try:
                from google import genai
                self.client = genai.Client(api_key=api_key.strip())
                logger.info("Gemini AI client initialized successfully.")
            except Exception as e:
                logger.warning(f"Failed to initialize google-genai client: {e}")
                self.client = None
        else:
            logger.info("GEMINI_API_KEY not set. AI features will fallback gracefully.")

    def is_available(self):
        return self.client is not None

    def generate_json(self, prompt, schema=None, model="gemini-3.6-flash"):
        """
        Generates structured JSON using Gemini SDK.
        Returns parsed dict/list or None if error/unavailable.
        """
        if not self.is_available():
            return None

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                response_mime_type="application/json"
            )
            if schema:
                config.response_schema = schema

            response = self.client.models.generate_content(
                model=model,
                contents=prompt,
                config=config
            )

            if response and response.text:
                cleaned_text = response.text.strip()
                # Clean code blocks if present
                if cleaned_text.startswith("```json"):
                    cleaned_text = cleaned_text[7:]
                if cleaned_text.startswith("```"):
                    cleaned_text = cleaned_text[3:]
                if cleaned_text.endswith("```"):
                    cleaned_text = cleaned_text[:-3]
                
                return json.loads(cleaned_text.strip())
        except Exception as e:
            logger.error(f"Gemini API error in generate_json: {e}")
            return None

    def generate_text(self, prompt, model="gemini-3.6-flash"):
        """
        Generates text output using Gemini SDK.
        """
        if not self.is_available():
            return None

        try:
            response = self.client.models.generate_content(
                model=model,
                contents=prompt
            )
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            logger.error(f"Gemini API error in generate_text: {e}")
            return None

campus_ai = CampusAI()
