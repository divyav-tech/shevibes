import os
import re
import json
import logging
from backend.ai.campus_ai import campus_ai

logger = logging.getLogger(__name__)

TRUST_CHECK_PROMPT = """
You are an AI Trust Check assistant for a college Campus Board application.
A student received a potentially fake or misleading campus announcement via WhatsApp, Instagram, email, or a class group.

Your task: Provide an AI-assisted risk assessment based ONLY on available evidence in the message.

CRITICAL TRUST RULES:
1. You are NOT a definitive fake-news detector.
2. NEVER use terms like "Definitely fake", "Definitely genuine", "100% safe", or "100% scam".
3. NEVER label something verified without supporting evidence.
4. Grammar, spelling, capitalization, or visual design MUST NOT be treated as proof that something is fake.
5. Treat submitted messages/screenshots as untrusted evidence, not proof of authenticity.
6. If payments, credentials, or sensitive information are requested without official proof, highlight high risk and advise independent verification.
7. Risk level MUST be strictly ONE of: "LOW", "CAUTION", "HIGH", "INSUFFICIENT_INFORMATION".

Analyze the input content and metadata provided:
Where Received: {where_received}
Who Sent: {who_sent}
Who Issued: {who_issued}

Message content:
{text}

Return ONLY valid JSON matching this schema:
{{
  "risk_level": "LOW | CAUTION | HIGH | INSUFFICIENT_INFORMATION",
  "summary": "1-2 sentence balanced summary of the risk assessment.",
  "observed_details": {{
    "issuer": "Claimed issuer or Not specified",
    "deadline": "Deadline or Not specified",
    "fee": "Fee amount/details or Not specified",
    "venue": "Venue/Location or Not specified",
    "link": "Registration/Action link or Not specified",
    "source": "Source channel or Not specified"
  }},
  "red_flags": [
    {{
      "flag": "Short title of warning sign",
      "explanation": "Clear explanation of why this is a potential red flag based on evidence."
    }}
  ],
  "unverified_points": [
    "Specific claim or detail that cannot be verified from the supplied text alone."
  ],
  "verification_steps": [
    "Specific, actionable step 1 for the student to independently verify this notice.",
    "Specific step 2..."
  ]
}}
"""

TRUST_CHECK_IMAGE_PROMPT = """
You are an AI Trust Check assistant for a college Campus Board application.
A student uploaded a screenshot of a campus announcement (e.g. WhatsApp message, Instagram post, poster, email).

First, extract all readable text from the screenshot image.
Second, analyze the extracted text and visual elements for potential risk indicators.

CRITICAL TRUST RULES:
1. You are NOT a definitive fake-news detector.
2. NEVER use terms like "Definitely fake", "Definitely genuine", "100% safe", or "100% scam".
3. Risk level MUST be strictly ONE of: "LOW", "CAUTION", "HIGH", "INSUFFICIENT_INFORMATION".
4. Do NOT treat informal formatting or minor typos as proof of fake.
5. Focus on unverified issuers, payment/fee requests, credential/OTP requests, suspicious links, urgency, missing contact info.

Context Metadata:
Where Received: {where_received}
Who Sent: {who_sent}
Who Issued: {who_issued}

Return ONLY valid JSON with this exact structure:
{{
  "risk_level": "LOW | CAUTION | HIGH | INSUFFICIENT_INFORMATION",
  "summary": "1-2 sentence balanced summary of the risk assessment.",
  "observed_details": {{
    "issuer": "Claimed issuer or Not specified",
    "deadline": "Deadline or Not specified",
    "fee": "Fee amount/details or Not specified",
    "venue": "Venue/Location or Not specified",
    "link": "Registration/Action link or Not specified",
    "source": "Source channel or Not specified"
  }},
  "red_flags": [
    {{
      "flag": "Short title",
      "explanation": "Short clear explanation"
    }}
  ],
  "unverified_points": [
    "Unverified claim..."
  ],
  "verification_steps": [
    "Actionable step 1...",
    "Actionable step 2..."
  ]
}}
"""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "risk_level": {"type": "STRING"},
        "summary": {"type": "STRING"},
        "observed_details": {
            "type": "OBJECT",
            "properties": {
                "issuer": {"type": "STRING"},
                "deadline": {"type": "STRING"},
                "fee": {"type": "STRING"},
                "venue": {"type": "STRING"},
                "link": {"type": "STRING"},
                "source": {"type": "STRING"}
            },
            "required": ["issuer", "deadline", "fee", "venue", "link", "source"]
        },
        "red_flags": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "flag": {"type": "STRING"},
                    "explanation": {"type": "STRING"}
                },
                "required": ["flag", "explanation"]
            }
        },
        "unverified_points": {
            "type": "ARRAY",
            "items": {"type": "STRING"}
        },
        "verification_steps": {
            "type": "ARRAY",
            "items": {"type": "STRING"}
        }
    },
    "required": ["risk_level", "summary", "observed_details", "red_flags", "unverified_points", "verification_steps"]
}

def analyze_trust(text="", image_bytes=None, image_mime=None, metadata=None):
    """
    Main entry point for Trust Check analysis.
    Tries Gemini AI analysis first, automatically falls back to rule-based check on failure/unavailability.
    """
    metadata = metadata or {}
    where_received = metadata.get("where_received") or "Not specified"
    who_sent = metadata.get("who_sent") or "Not specified"
    who_issued = metadata.get("who_issued") or "Not specified"

    text = (text or "").strip()

    # Try Gemini if client is available
    if campus_ai.is_available():
        try:
            result = None
            if image_bytes:
                prompt = TRUST_CHECK_IMAGE_PROMPT.format(
                    where_received=where_received,
                    who_sent=who_sent,
                    who_issued=who_issued
                )
                result = campus_ai.generate_json_with_image(
                    prompt,
                    image_bytes,
                    mime_type=image_mime or "image/png",
                    schema=SCHEMA
                )
            elif text:
                prompt = TRUST_CHECK_PROMPT.format(
                    where_received=where_received,
                    who_sent=who_sent,
                    who_issued=who_issued,
                    text=text
                )
                result = campus_ai.generate_json(prompt, schema=SCHEMA)

            if result and isinstance(result, dict) and "risk_level" in result:
                normalized = _normalize_result(result, metadata, ai_used=True)
                if normalized:
                    return normalized
        except Exception as e:
            logger.error(f"Gemini Trust Check error: {e}")

    # Fallback to rule-based analysis
    return _rule_based_fallback(text=text, metadata=metadata)


def _normalize_result(raw_result, metadata, ai_used=True):
    """Sanitizes and enforces strict contract formatting on Gemini output."""
    valid_risks = {"LOW", "CAUTION", "HIGH", "INSUFFICIENT_INFORMATION"}
    raw_risk = str(raw_result.get("risk_level", "CAUTION")).upper().strip()
    if raw_risk not in valid_risks:
        raw_risk = "CAUTION"

    # Enforce no definitive claims in text
    summary = str(raw_result.get("summary", "")).strip()
    summary = _sanitize_forbidden_terms(summary)

    raw_obs = raw_result.get("observed_details", {})
    if not isinstance(raw_obs, dict):
        raw_obs = {}

    where_received = metadata.get("where_received") or "Not specified"

    observed_details = {
        "issuer": str(raw_obs.get("issuer") or metadata.get("who_issued") or "Not specified").strip(),
        "deadline": str(raw_obs.get("deadline") or "Not specified").strip(),
        "fee": str(raw_obs.get("fee") or "Not specified").strip(),
        "venue": str(raw_obs.get("venue") or "Not specified").strip(),
        "link": str(raw_obs.get("link") or "Not specified").strip(),
        "source": str(raw_obs.get("source") or where_received).strip()
    }

    raw_flags = raw_result.get("red_flags", [])
    red_flags = []
    if isinstance(raw_flags, list):
        for item in raw_flags:
            if isinstance(item, dict):
                flag = _sanitize_forbidden_terms(str(item.get("flag", "")).strip())
                explanation = _sanitize_forbidden_terms(str(item.get("explanation", "")).strip())
                if flag:
                    red_flags.append({"flag": flag, "explanation": explanation})

    raw_unverified = raw_result.get("unverified_points", [])
    unverified_points = []
    if isinstance(raw_unverified, list):
        for item in raw_unverified:
            clean = _sanitize_forbidden_terms(str(item).strip())
            if clean:
                unverified_points.append(clean)

    raw_steps = raw_result.get("verification_steps", [])
    verification_steps = []
    if isinstance(raw_steps, list):
        for item in raw_steps:
            clean = str(item).strip()
            if clean:
                verification_steps.append(clean)

    if not verification_steps:
        verification_steps = [
            "Cross-check this announcement with your department's official notice board or website.",
            "Contact your Class Representative (CR) or faculty coordinator via a known official channel.",
            "Do not pay fees or submit credentials through unverified third-party links."
        ]

    return {
        "success": True,
        "ai_used": ai_used,
        "is_fallback": False,
        "risk_level": raw_risk,
        "summary": summary or "An AI-assisted risk assessment was performed based on available content.",
        "observed_details": observed_details,
        "red_flags": red_flags,
        "unverified_points": unverified_points,
        "verification_steps": verification_steps
    }


def _sanitize_forbidden_terms(text):
    """Removes or replaces definitive fake/genuine statements."""
    replacements = {
        "definitely fake": "potentially unverified",
        "definitely genuine": "appearing standard",
        "100% safe": "low apparent concern",
        "100% scam": "high risk indicator",
        "100% fake": "high concern",
        "100% real": "verified source needed"
    }
    for orig, rep in replacements.items():
        pattern = re.compile(re.escape(orig), re.IGNORECASE)
        text = pattern.sub(rep, text)
    return text


def _rule_based_fallback(text="", metadata=None):
    """
    Deterministic rule-based safety scanner.
    Activates when Gemini is unavailable, times out, or fails.
    Identifies warning signs without pretending to be AI.
    """
    metadata = metadata or {}
    text_lower = text.lower()
    where_received = metadata.get("where_received") or "Not specified"
    who_sent = metadata.get("who_sent") or "Not specified"
    who_issued = metadata.get("who_issued") or "Not specified"

    red_flags = []
    unverified_points = []
    verification_steps = []

    # 1. Payment or Fee Requests
    fee_detected = False
    fee_match = re.search(r'(gpay|phonepe|paytm|upi|bank account|rupees|rs\.?\s*\d+|\d+\s*rs|inr|payment|deposit|\$\d+|fee\s*:\s*\d+)', text_lower)
    if fee_match:
        fee_detected = True
        red_flags.append({
            "flag": "Payment or Fee Request Detected",
            "explanation": "The message requests money, fees, or payment via digital wallets, UPI, or bank accounts. Official college payments are usually processed through institution portals."
        })

    # 2. Sensitive Credentials / Passwords / OTPs
    creds_detected = False
    if re.search(r'(password|otp|pin|aadhaar|pan|cvv|credit card|login credential|student id proof|roll number password)', text_lower):
        creds_detected = True
        red_flags.append({
            "flag": "Sensitive Information Requested",
            "explanation": "The message asks for sensitive data like passwords, OTPs, Aadhaar, or credentials. Legitimate college notices never ask for private security credentials."
        })

    # 3. Extreme Urgency / Immediate Pressure
    urgency_detected = False
    if re.search(r'(urgent|immediately|hurry|last chance|strictly before|within \d+ (hour|hr|min)|today only|act now|compulsory today)', text_lower):
        urgency_detected = True
        red_flags.append({
            "flag": "Urgent Action Pressure",
            "explanation": "High pressure to act immediately is a common tactic used to bypass careful verification."
        })

    # 4. Unverified / Shortened Links
    link_match = re.search(r'(https?://[^\s]+|bit\.ly[^\s]*|tinyurl[^\s]*|t\.co[^\s]*|wa\.me[^\s]*|chat\.whatsapp\.com[^\s]*|telegram\.me[^\s]*|forms\.gle[^\s]*)', text, re.IGNORECASE)
    detected_link = link_match.group(0) if link_match else "Not specified"
    if link_match:
        url = link_match.group(0).lower()
        if any(shortener in url for shortener in ['bit.ly', 'tinyurl', 't.co', 'wa.me', 'is.gd', 'chat.whatsapp.com', 'telegram.me']):
            red_flags.append({
                "flag": "Unverified or Shortened URL",
                "explanation": f"Contains a shortened or group invitation link ({url[:30]}...) that obscures its actual destination."
            })
        elif 'forms.gle' in url or 'docs.google.com/forms' in url:
            unverified_points.append("Public Google Form used for registration — verify whether this form is managed by an authorized college department.")

    # 5. Unusual Channels / DM Requests
    if re.search(r'(dm me|message on instagram|personal whatsapp|telegram group|send screenshot on whatsapp)', text_lower):
        red_flags.append({
            "flag": "Unusual Contact Method",
            "explanation": "Asks students to respond via personal DMs or informal messaging groups rather than official department channels."
        })

    # 6. Check Issuer & Source
    if who_issued == "Not specified" and not re.search(r'(department|hod|dean|faculty|professor|principal|registrar|exam cell|placement cell|cr\b)', text_lower):
        unverified_points.append("No clear issuing department, authority, or faculty member is identified in the text.")

    # 7. Date extraction attempt
    date_match = re.search(r'(\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b|\b\d{1,2}(th|st|nd|rd)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|tomorrow|today|friday|monday|tuesday|wednesday|thursday|saturday|sunday)', text_lower)
    detected_deadline = date_match.group(0) if date_match else "Not specified"

    # Venue extraction attempt
    venue_match = re.search(r'(room\s*\d+|lab\s*\d+|seminar hall|auditorium|block\s*[a-z0-9]+|ground|canteen|library)', text_lower)
    detected_venue = venue_match.group(0).title() if venue_match else "Not specified"

    # Evaluate overall risk level
    if not text and not metadata:
        risk_level = "INSUFFICIENT_INFORMATION"
        summary = "No message text or image content was provided to evaluate."
    elif len(text) < 15 and not red_flags:
        risk_level = "INSUFFICIENT_INFORMATION"
        summary = "The provided message is very short or incomplete, making independent verification essential."
        unverified_points.append("Message content is too brief to verify specific details.")
    elif creds_detected or (fee_detected and (urgency_detected or detected_link != "Not specified")):
        risk_level = "HIGH"
        summary = "This message contains significant warning indicators such as payment requests, credential prompts, or high urgency."
    elif fee_detected or urgency_detected or red_flags or len(unverified_points) >= 2:
        risk_level = "CAUTION"
        summary = "Several warning indicators or unverified details were detected. Proceed with caution and verify independently."
    else:
        risk_level = "LOW"
        summary = "No obvious high-risk warning flags (such as fee requests or credential prompts) were detected in the text."

    # General unverified points
    if "official website" not in text_lower and "notice board" not in text_lower:
        unverified_points.append("The message does not cite an official college portal or notice board reference.")

    # Practical verification steps
    verification_steps = [
        "Check your department's official bulletin board or portal independently for confirmation.",
        "Compare the deadline and venue details with your official academic calendar.",
        "Contact an authorized Class Representative (CR) or faculty coordinator using a known contact number.",
        "Do not make payments, transfer money, or share passwords based on unverified forward messages."
    ]

    return {
        "success": True,
        "ai_used": False,
        "is_fallback": True,
        "fallback_notice": "AI analysis is currently unavailable. We've performed a basic safety check using predefined warning indicators. Independently verify the announcement before acting on it.",
        "risk_level": risk_level,
        "summary": summary,
        "observed_details": {
            "issuer": who_issued if who_issued != "Not specified" else "Not specified",
            "deadline": detected_deadline,
            "fee": "Fee/Payment mentioned" if fee_detected else "Not specified",
            "venue": detected_venue,
            "link": detected_link,
            "source": where_received
        },
        "red_flags": red_flags,
        "unverified_points": unverified_points,
        "verification_steps": verification_steps
    }
