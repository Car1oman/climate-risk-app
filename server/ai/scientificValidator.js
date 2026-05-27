/**
 * Post-generation scientific validator for AI output.
 * Enforces I4 (all AI output validated) and I6 (no financial figures).
 * Context parameter is optional now — will be required in P1 (AIEnrichmentContext migration).
 */

const FORBIDDEN_PATTERNS = [
  {
    pattern: /causará/gi,
    violation: 'DETERMINISTIC_FUTURE',
    autoFix: s => s.replace(/causará/gi, 'podría aumentar la probabilidad de'),
  },
  {
    pattern: /\$[\s]?[\d,.]+/g,
    violation: 'FINANCIAL_FIGURE',
    autoFix: null,
  },
  {
    pattern: /S\/\.?\s?[\d,.]+/g,
    violation: 'FINANCIAL_FIGURE_SOLES',
    autoFix: null,
  },
  {
    pattern: /USD\s?[\d,.]+/gi,
    violation: 'FINANCIAL_FIGURE_USD',
    autoFix: null,
  },
  {
    pattern: /SSP[1-5]-\d\.\d/g,
    violation: 'RAW_SSP_CODE',
    autoFix: s => s
      .replace(/SSP2-4\.5/gi, 'escenario de emisiones moderadas')
      .replace(/SSP5-8\.5/gi, 'escenario de altas emisiones')
      .replace(/SSP[1-5]-\d\.\d/g, 'escenario de emisiones'),
  },
  {
    pattern: /garantiza/gi,
    violation: 'CERTAINTY_LANGUAGE',
    autoFix: s => s.replace(/garantiza/gi, 'sugiere'),
  },
  {
    pattern: /inevitablemente/gi,
    violation: 'CERTAINTY_LANGUAGE',
    autoFix: s => s.replace(/inevitablemente/gi, 'con mayor probabilidad'),
  },
  {
    pattern: /con certeza/gi,
    violation: 'CERTAINTY_LANGUAGE',
    autoFix: s => s.replace(/con certeza/gi, 'con los modelos disponibles'),
  },
  {
    pattern: /emergencia climática/gi,
    violation: 'ALARMIST_LANGUAGE',
    autoFix: null,
  },
  {
    pattern: /catástrofe/gi,
    violation: 'ALARMIST_LANGUAGE',
    autoFix: null,
  },
  {
    pattern: /colapso de/gi,
    violation: 'ALARMIST_LANGUAGE',
    autoFix: null,
  },
  {
    pattern: /sin precedentes/gi,
    violation: 'UNSUPPORTED_CLAIM',
    autoFix: null,
  },
];

/**
 * Validates AI-generated text against scientific guardrails.
 * @param {string} text - Raw text from Gemini
 * @param {object|null} context - AIEnrichmentContext (optional, used in P1+)
 * @returns {{ passed: boolean, violations: Array, autoFixable: boolean, sanitizedText?: string }}
 */
export function validateAIOutput(text, context = null) {
  const violations = [];
  let sanitized = text;
  let allAutoFixable = true;

  for (const rule of FORBIDDEN_PATTERNS) {
    rule.pattern.lastIndex = 0; // reset stateful regex
    if (rule.pattern.test(text)) {
      rule.pattern.lastIndex = 0;
      const match = text.match(rule.pattern);
      violations.push({ type: rule.violation, found: match?.[0] ?? null });

      if (!rule.autoFix) {
        allAutoFixable = false;
      } else {
        sanitized = rule.autoFix(sanitized);
      }
    }
  }

  // Context-based confidence validation (active from P1 when context is provided)
  if (context?.constraints?.maxConfidenceForHorizon === 'low') {
    const highConfidencePatterns = [/con alta confianza/gi, /es muy probable que/gi, /definitivamente/gi];
    for (const p of highConfidencePatterns) {
      if (p.test(text)) {
        violations.push({ type: 'CONFIDENCE_OVERSTATED', found: text.match(p)?.[0] ?? null });
        allAutoFixable = false;
      }
    }
  }

  const hasViolations = violations.length > 0;

  return {
    passed: !hasViolations,
    violations,
    autoFixable: hasViolations && allAutoFixable,
    sanitizedText: hasViolations && allAutoFixable ? sanitized : undefined,
  };
}
