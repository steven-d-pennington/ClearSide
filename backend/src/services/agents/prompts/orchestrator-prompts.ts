/**
 * Orchestrator Agent Prompt Templates
 *
 * System and user prompts for the Orchestrator Agent that normalizes
 * user propositions into structured, debatable formats.
 */

/**
 * System prompt for orchestrator agent
 *
 * This defines the agent's role, responsibilities, and output format.
 */
export const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator Agent for ClearSide, a structured reasoning platform.

Your SOLE responsibility is to normalize user input into a clear, debatable proposition.

HARD RULES:
1. Output ONLY the proposition section - NO arguments, opinions, or analysis
2. Convert statements into neutral questions suitable for debate
3. Extract context (geography, timeframe, domain) if mentioned or inferrable
4. Identify key stakeholders affected by the proposition
5. Frame the debate appropriately

OUTPUT FORMAT:
Return valid JSON with this exact structure:
{
  "normalized_question": "Clear, neutral, debatable question",
  "context": {
    "category": "Subject area (e.g., 'technology policy', 'healthcare', 'education')",
    "time_context": "Time scope if relevant (e.g., '2025-2030', 'Next decade')",
    "geographic_scope": "Location if relevant (e.g., 'United States', 'Global')",
    "stakeholders": ["Group 1", "Group 2", "Group 3"],
    "key_assumptions": ["Assumption 1", "Assumption 2"],
    "background": "Brief background context if needed"
  },
  "confidence": 0.9
}

QUALITY STANDARDS:
- Normalized question must be neutral (no leading language)
- Must be answerable with FOR/AGAINST positions
- Must be specific enough to debate meaningfully
- Prefer "Should X do Y?" format over yes/no questions
- Stakeholders should be concrete groups, not abstractions
- Confidence score (0-1) reflects how clear the normalization is

EXAMPLES:

Input: "AI is dangerous and should be banned"
Output:
{
  "normalized_question": "Should artificial intelligence development be subject to a moratorium or ban?",
  "context": {
    "category": "technology regulation",
    "time_context": "Near-term policy consideration",
    "geographic_scope": "Global",
    "stakeholders": ["AI researchers", "Technology companies", "Regulators", "General public"],
    "key_assumptions": ["AI poses potential risks", "Government regulation is feasible"],
    "background": "Debate over AI safety and regulation"
  },
  "confidence": 0.95
}

Input: "Should we have universal healthcare?"
Output:
{
  "normalized_question": "Should the United States implement a universal healthcare system?",
  "context": {
    "category": "healthcare policy",
    "time_context": "Current policy debate",
    "geographic_scope": "United States",
    "stakeholders": ["Patients", "Healthcare providers", "Insurance companies", "Government", "Taxpayers"],
    "key_assumptions": ["Healthcare access is important", "Government can administer healthcare"],
    "background": "Ongoing debate about healthcare reform in the US"
  },
  "confidence": 0.9
}

Input: "Remote work vs office work"
Output:
{
  "normalized_question": "Should remote work be the default option for knowledge workers in the technology sector?",
  "context": {
    "category": "workplace policy",
    "time_context": "Post-pandemic era",
    "geographic_scope": "United States",
    "stakeholders": ["Employees", "Employers", "Commercial real estate", "Local economies"],
    "key_assumptions": ["Remote work is technically feasible for many roles", "Workplace policies affect productivity"],
    "background": "Shift in work patterns following COVID-19 pandemic"
  },
  "confidence": 0.85
}

Input: "Climate change is real"
Output:
{
  "normalized_question": "Should governments implement aggressive carbon reduction policies to address climate change?",
  "context": {
    "category": "environmental policy",
    "time_context": "Next decade",
    "geographic_scope": "Global",
    "stakeholders": ["Governments", "Industries", "Environmental organizations", "Citizens", "Future generations"],
    "key_assumptions": ["Climate change is occurring", "Government action can impact outcomes"],
    "background": "Global debate over climate policy and economic impacts"
  },
  "confidence": 0.9
}`;

/**
 * Build user prompt for normalization
 *
 * @param rawInput - User's raw input to normalize
 * @param context - Optional additional context provided by user
 * @returns Formatted prompt for LLM
 */
export function buildOrchestratorPrompt(
  rawInput: string,
  context?: {
    geography?: string;
    timeframe?: string;
    domain?: string;
    background?: string;
  }
): string {
  let prompt = `Normalize this user input into a debatable proposition:\n\n"${rawInput}"`;

  if (context) {
    const hasContext =
      context.geography || context.timeframe || context.domain || context.background;

    if (hasContext) {
      prompt += '\n\nUser-provided context:';

      if (context.geography) {
        prompt += `\n- Geography: ${context.geography}`;
      }
      if (context.timeframe) {
        prompt += `\n- Timeframe: ${context.timeframe}`;
      }
      if (context.domain) {
        prompt += `\n- Domain: ${context.domain}`;
      }
      if (context.background) {
        prompt += `\n- Background: ${context.background}`;
      }
    }
  }

  prompt += '\n\nReturn the normalized proposition as valid JSON following the schema.';

  return prompt;
}

/**
 * Example normalizations for testing and documentation
 */
export const NORMALIZATION_EXAMPLES = [
  {
    input: 'AI data centers are consuming too much energy',
    expected: {
      normalized_question:
        'Should new AI data centers be subject to stricter energy consumption regulations?',
      context: {
        category: 'technology policy',
        time_context: '2025-2030',
        geographic_scope: 'Global',
        stakeholders: ['Tech companies', 'Energy providers', 'Environmental groups', 'Regulators'],
        key_assumptions: [
          'AI data centers consume significant energy',
          'Regulation can reduce energy consumption',
        ],
        background: 'Growing concerns about AI infrastructure energy demands',
      },
      confidence: 0.9,
    },
  },
  {
    input: 'Remote work',
    expected: {
      normalized_question:
        'Should remote work be the default option for knowledge workers in the technology sector?',
      context: {
        category: 'workplace policy',
        time_context: '2025 onwards',
        geographic_scope: 'United States',
        stakeholders: ['Employees', 'Employers', 'Commercial real estate', 'Local economies'],
        key_assumptions: [
          'Remote work is feasible for many roles',
          'Default policies affect workforce productivity',
        ],
        background: 'Post-pandemic shift in workplace norms',
      },
      confidence: 0.75,
    },
  },
  {
    input: 'Should the United States implement universal basic income?',
    expected: {
      normalized_question:
        'Should the United States implement a universal basic income program?',
      context: {
        category: 'economic policy',
        time_context: 'Near-term policy consideration',
        geographic_scope: 'United States',
        stakeholders: ['Low-income households', 'Taxpayers', 'Government', 'Employers'],
        key_assumptions: [
          'UBI is economically feasible',
          'Government can administer such programs',
        ],
        background: 'Debate over income inequality and automation impacts',
      },
      confidence: 0.95,
    },
  },
  {
    input: 'Social media bad for kids',
    expected: {
      normalized_question:
        'Should social media access be restricted for users under 16 years old?',
      context: {
        category: 'technology regulation',
        time_context: 'Current policy debate',
        geographic_scope: 'United States',
        stakeholders: ['Minors', 'Parents', 'Social media companies', 'Mental health professionals'],
        key_assumptions: [
          'Social media affects youth mental health',
          'Age restrictions are enforceable',
        ],
        background: 'Growing concerns about social media impacts on youth',
      },
      confidence: 0.85,
    },
  },
];
