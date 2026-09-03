const logger = require("../config/logger");

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function isEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Low-level call to Gemini's generateContent endpoint, instructed to return
 * pure JSON. Returns null (never throws) if the key is missing, the call
 * fails, or the response isn't parseable JSON — every caller in this file
 * has a sane fallback for that case, since AI features must never block or
 * break the underlying complaint workflow.
 */
async function generateJSON(prompt, { temperature = 0.2 } = {}) {
  if (!isEnabled()) return null;

  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
  ];

  for (const model of modelsToTry) {
    const url = `${API_BASE}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!res.ok) {
        logger.warn(`[gemini] ${model} failed (${res.status}), trying fallback...`);
        continue;
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      // Prefer part with text that is not a thought block
      const textPart = parts.find((p) => p.text && !p.thought) || parts.find((p) => p.text);
      const text = textPart?.text;
      if (!text) continue;

      // Clean out markdown wrappers if Gemini wrapped JSON in ```json
      const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      return JSON.parse(clean);
    } catch (err) {
      logger.warn(`[gemini] ${model} error: ${err.message}`);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 1. Complaint Classification
// ---------------------------------------------------------------------------
async function classifyComplaint({ title, description, categories }) {
  const otherCat = categories.find((c) => c.name.toLowerCase() === "other");
  // Build a rich lookup including department so Gemini can reason about routing
  const categoryList = categories
    .map((c) => ({ id: c.id, name: c.name, department: c.Department?.name || c.department || "" }))
    .slice(0, 60);

  const departments = [...new Set(categoryList.map((c) => c.department).filter(Boolean))];

  const prompt = `You are an expert complaint triage officer for a college/hostel/campus complaint management system.
You have ${departments.length} departments available: ${departments.join(", ")}.

TASK: Analyze the complaint and return the BEST matching categoryId from the list below.

STRICT RULES:
1. Pick the most specific matching category. 
2. If the complaint involves safety, fire, accident, theft, or security: prefer Security & Compliance categories and set priority to "CRITICAL" or "HIGH".
3. If the complaint involves medical emergency: set priority to "CRITICAL".
4. If the complaint is vague, general, or does not clearly match any specific category: pick the category named "Other".
5. The "Other" category id is: "${otherCat ? otherCat.id : "null"}".

Respond ONLY with valid JSON (no markdown, no explanation):
{"categoryId": string, "categoryName": string, "subcategory": string, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "confidence": number, "suggestedDepartment": string}

Available Categories (id, name, department):
${JSON.stringify(categoryList)}

Complaint title: ${title}
Complaint description: ${description}`;

  const result = await generateJSON(prompt);
  if (!result) {
    return {
      categoryId: otherCat ? otherCat.id : null,
      categoryName: otherCat ? otherCat.name : "Other",
      subcategory: "General",
      priority: "MEDIUM",
      confidence: 0.5,
      suggestedDepartment: null,
    };
  }

  const matchedCat = categories.find((c) => c.id === result.categoryId) || otherCat;
  return {
    categoryId: matchedCat ? matchedCat.id : (otherCat ? otherCat.id : null),
    categoryName: matchedCat ? matchedCat.name : (otherCat ? otherCat.name : "Other"),
    subcategory: result.subcategory || null,
    priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(result.priority)
      ? result.priority
      : "MEDIUM",
    confidence: typeof result.confidence === "number" ? result.confidence : null,
    suggestedDepartment: result.suggestedDepartment || null,
  };
}

// ---------------------------------------------------------------------------
// 1b. AI Auto-Escalation Detection
// ---------------------------------------------------------------------------
/**
 * Given a complaint and its current status/history, decide if it should
 * be auto-escalated by the system. Returns { shouldEscalate, reason, severity }.
 */
async function detectEscalation({ title, description, priority, status, ageDays, categoryName }) {
  const prompt = `You are an SLA and escalation monitor for a campus complaint system.
Review the following complaint metadata and decide if it needs URGENT escalation by the system.

Escalate if ANY of these conditions hold:
- Priority is CRITICAL or HIGH and ageDays >= 1 (1 day without resolution)
- Priority is MEDIUM and ageDays >= 3
- The description contains dangerous/safety keywords (fire, flood, injury, assault, sick, emergency)
- The complaint involves security, medical, or structural failure

Respond ONLY with JSON:
{"shouldEscalate": boolean, "reason": string, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"}

Complaint:
- Title: ${title}
- Description: ${description}
- Category: ${categoryName}
- Priority: ${priority}
- Status: ${status}
- Age (days open): ${ageDays}`;

  const result = await generateJSON(prompt);
  if (!result) return { shouldEscalate: false, reason: null, severity: null };
  return {
    shouldEscalate: Boolean(result.shouldEscalate),
    reason: result.reason || null,
    severity: result.severity || null,
  };
}

// ---------------------------------------------------------------------------
// 2. Duplicate Detection
// ---------------------------------------------------------------------------
async function detectDuplicates({ title, description }, recentComplaints) {
  if (!recentComplaints.length) return { isDuplicate: false, duplicateOfId: null };

  const candidates = recentComplaints
    .map((c) => ({ id: c.id, title: c.title, description: c.description }))
    .slice(0, 20);

  const prompt = `Compare the NEW complaint against the CANDIDATE list and decide if it is
a duplicate/near-duplicate of an existing open complaint (same underlying issue, same
rough location/context). Respond ONLY with JSON:
{"isDuplicate": boolean, "duplicateOfId": string|null, "similarity": number, "reason": string}.

NEW complaint: ${JSON.stringify({ title, description })}
CANDIDATES: ${JSON.stringify(candidates)}`;

  const result = await generateJSON(prompt);
  if (!result) return { isDuplicate: false, duplicateOfId: null };
  return {
    isDuplicate: Boolean(result.isDuplicate),
    duplicateOfId: result.duplicateOfId || null,
    similarity: typeof result.similarity === "number" ? result.similarity : null,
    reason: result.reason || null,
  };
}

// ---------------------------------------------------------------------------
// 3. Complaint Summarization
// ---------------------------------------------------------------------------
async function summarizeThread({ title, description }, comments) {
  const thread = comments.map((c) => ({ author: c.userId, content: c.content }));

  const prompt = `Summarize this complaint thread for a busy staff member in 2-3 sentences,
focusing on the current state of the issue and what's still outstanding. Respond ONLY
with JSON: {"summary": string}.

Title: ${title}
Description: ${description}
Comments (chronological): ${JSON.stringify(thread)}`;

  const result = await generateJSON(prompt);
  return result?.summary || null;
}

// ---------------------------------------------------------------------------
// 4. Suggested Resolution
// ---------------------------------------------------------------------------
async function suggestResolution({ title, description, categoryName }) {
  const prompt = `Suggest practical troubleshooting/resolution steps a staff member could
take for this complaint. Respond ONLY with JSON:
{"steps": string[], "estimatedEffort": "LOW"|"MEDIUM"|"HIGH"}.

Category: ${categoryName || "unknown"}
Title: ${title}
Description: ${description}`;

  const result = await generateJSON(prompt);
  if (!result) return null;
  return {
    steps: Array.isArray(result.steps) ? result.steps : [],
    estimatedEffort: result.estimatedEffort || "MEDIUM",
  };
}

// ---------------------------------------------------------------------------
// 5. Comment Sentiment / Urgency (internal signal only, not punitive)
// ---------------------------------------------------------------------------
async function analyzeSentiment(commentText) {
  const prompt = `Classify the sentiment and urgency of this complaint comment. This is
used only as an internal triage signal, never to penalize the author. Respond ONLY with
JSON: {"sentiment": "POSITIVE"|"NEUTRAL"|"NEGATIVE"|"URGENT"}.

Comment: ${commentText}`;

  const result = await generateJSON(prompt);
  const valid = ["POSITIVE", "NEUTRAL", "NEGATIVE", "URGENT"];
  return valid.includes(result?.sentiment) ? result.sentiment : null;
}

// ---------------------------------------------------------------------------
// 6. Resolution Quality Check
// ---------------------------------------------------------------------------
async function checkResolutionQuality({ title, description, resolutionNote }) {
  const prompt = `A staff member marked this complaint resolved with the note below.
Evaluate whether the note plausibly and specifically addresses the complaint (not a
generic "fixed it" with no detail). Respond ONLY with JSON:
{"sufficient": boolean, "qualityScore": number, "feedback": string}.

Complaint title: ${title}
Complaint description: ${description}
Resolution note: ${resolutionNote}`;

  const result = await generateJSON(prompt);
  if (!result) return null;
  return {
    sufficient: Boolean(result.sufficient),
    qualityScore: typeof result.qualityScore === "number" ? result.qualityScore : null,
    feedback: result.feedback || null,
  };
}

module.exports = {
  isEnabled,
  classifyComplaint,
  detectDuplicates,
  detectEscalation,
  summarizeThread,
  suggestResolution,
  analyzeSentiment,
  checkResolutionQuality,
};
