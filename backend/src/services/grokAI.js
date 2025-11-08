/**
 * Grok AI Service (xAI Integration)
 *
 * Provides industry-specific accessibility remediation using Grok.
 * Falls back to Google Gemini if Grok API unavailable.
 *
 * Features:
 * - Vertical-aware remediation suggestions
 * - Code examples by industry
 * - Priority ranking of fixes
 * - Impact analysis
 * - Compliance mapping
 */

const { getVerticalConfig } = require('../config/verticals');
const { CircuitBreakerManager } = require('./circuitBreaker');

class GrokAIService {
  constructor() {
    // xAI Grok API configuration
    this.grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    this.grokApiUrl = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
    this.grokModel = process.env.GROK_MODEL || 'grok-beta';

    // Fallback to Gemini
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    // Circuit breakers
    this.grokBreaker = CircuitBreakerManager.getBreaker('grok-ai', {
      failureThreshold: 3,
      resetTimeout: 30000,
    });

    this.geminiBreaker = CircuitBreakerManager.getBreaker('gemini-ai', {
      failureThreshold: 3,
      resetTimeout: 30000,
    });

    // Metrics
    this.metrics = {
      grokCalls: 0,
      geminiFallbacks: 0,
      errors: 0,
      avgResponseTime: 0,
    };
  }

  /**
   * Generate industry-specific remediation
   */
  async generateRemediation(violations, options = {}) {
    const {
      vertical = 'general',
      url = '',
      includeCodeExamples = true,
      prioritize = true,
    } = options;

    const startTime = Date.now();

    try {
      // Try Grok first
      if (this.grokApiKey) {
        this.metrics.grokCalls++;
        const result = await this.callGrok(violations, vertical, url, includeCodeExamples);
        this.updateMetrics(startTime);
        return result;
      }

      // Fallback to Gemini
      if (this.geminiApiKey) {
        this.metrics.geminiFallbacks++;
        const result = await this.callGemini(violations, vertical, url, includeCodeExamples);
        this.updateMetrics(startTime);
        return result;
      }

      // No AI available, return structured fallback
      return this.getFallbackRemediation(violations, vertical);
    } catch (error) {
      this.metrics.errors++;
      console.error('[Grok] AI remediation error:', error.message);
      return this.getFallbackRemediation(violations, vertical);
    }
  }

  /**
   * Call Grok API
   */
  async callGrok(violations, vertical, url, includeCodeExamples) {
    const prompt = this.buildPrompt(violations, vertical, url, includeCodeExamples);

    try {
      const response = await this.grokBreaker.execute(async () => {
        const res = await fetch(this.grokApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.grokApiKey}`,
          },
          body: JSON.stringify({
            model: this.grokModel,
            messages: [
              {
                role: 'system',
                content: this.getSystemPrompt(vertical),
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!res.ok) {
          throw new Error(`Grok API error: ${res.status}`);
        }

        return await res.json();
      });

      return this.parseGrokResponse(response, vertical);
    } catch (error) {
      console.error('[Grok] API call failed:', error.message);
      throw error;
    }
  }

  /**
   * Call Gemini API (fallback)
   */
  async callGemini(violations, vertical, url, includeCodeExamples) {
    const prompt = this.buildPrompt(violations, vertical, url, includeCodeExamples);

    try {
      const response = await this.geminiBreaker.execute(async () => {
        const res = await fetch(
          `${this.geminiApiUrl}?key=${this.geminiApiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: this.getSystemPrompt(vertical) + '\n\n' + prompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000,
              },
            }),
          }
        );

        if (!res.ok) {
          throw new Error(`Gemini API error: ${res.status}`);
        }

        return await res.json();
      });

      return this.parseGeminiResponse(response, vertical);
    } catch (error) {
      console.error('[Gemini] API call failed:', error.message);
      throw error;
    }
  }

  /**
   * Get system prompt for vertical
   */
  getSystemPrompt(vertical) {
    const config = getVerticalConfig(vertical);

    return `You are an expert accessibility consultant specializing in ${config.name}.

Your expertise includes:
- WCAG 2.2 Level ${config.compliance.level} compliance
- ${config.compliance.standards.join(', ')}
- Industry-specific accessibility requirements for ${vertical}
- Practical, actionable remediation strategies

When analyzing violations:
1. Prioritize by business impact in ${config.name}
2. Provide code examples specific to ${vertical} use cases
3. Reference ${config.compliance.standards.join(' and ')}
4. Consider ${vertical}-specific user needs and contexts
5. Give clear, step-by-step remediation instructions

Format responses as JSON with:
{
  "summary": "Brief overview",
  "prioritizedFixes": [...],
  "industryContext": "Why this matters in ${vertical}",
  "estimatedEffort": "time estimate",
  "complianceImpact": "compliance benefit"
}`;
  }

  /**
   * Build remediation prompt
   */
  buildPrompt(violations, vertical, url, includeCodeExamples) {
    const config = getVerticalConfig(vertical);
    const topViolations = violations.slice(0, 10); // Limit for prompt size

    let prompt = `Analyze these accessibility violations for a ${config.name} website`;
    if (url) {
      prompt += ` (${url})`;
    }
    prompt += `:\n\n`;

    topViolations.forEach((violation, index) => {
      prompt += `${index + 1}. ${violation.id}: ${violation.description}\n`;
      prompt += `   Impact: ${violation.impact}\n`;
      prompt += `   Affected elements: ${violation.nodes?.length || 0}\n`;
      if (violation.nodes && violation.nodes[0]) {
        prompt += `   Example: ${violation.nodes[0].html}\n`;
      }
      prompt += `\n`;
    });

    prompt += `\nProvide ${vertical}-specific remediation guidance with:\n`;
    prompt += `1. Priority ranking for ${config.name} context\n`;
    prompt += `2. Business impact in ${vertical}\n`;
    if (includeCodeExamples) {
      prompt += `3. Code examples fixing the violations\n`;
    }
    prompt += `4. Estimated time to fix\n`;
    prompt += `5. Compliance standards met (${config.compliance.standards.join(', ')})\n`;

    // Add vertical-specific context
    if (config.contextualGuidance) {
      prompt += `\nConsider these ${vertical}-specific guidelines:\n`;
      Object.entries(config.contextualGuidance).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
    }

    return prompt;
  }

  /**
   * Parse Grok API response
   */
  parseGrokResponse(response, vertical) {
    try {
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in Grok response');
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(content);
        return {
          provider: 'grok',
          vertical,
          ...parsed,
        };
      } catch {
        // If not JSON, return as markdown
        return {
          provider: 'grok',
          vertical,
          summary: content.substring(0, 200),
          remediation: content,
          format: 'markdown',
        };
      }
    } catch (error) {
      console.error('[Grok] Response parsing error:', error.message);
      return this.getFallbackRemediation([], vertical);
    }
  }

  /**
   * Parse Gemini API response
   */
  parseGeminiResponse(response, vertical) {
    try {
      const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error('No content in Gemini response');
      }

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(content);
        return {
          provider: 'gemini',
          vertical,
          ...parsed,
        };
      } catch {
        // If not JSON, return as markdown
        return {
          provider: 'gemini',
          vertical,
          summary: content.substring(0, 200),
          remediation: content,
          format: 'markdown',
        };
      }
    } catch (error) {
      console.error('[Gemini] Response parsing error:', error.message);
      return this.getFallbackRemediation([], vertical);
    }
  }

  /**
   * Get fallback remediation (no AI)
   */
  getFallbackRemediation(violations, vertical) {
    const config = getVerticalConfig(vertical);

    const topIssues = violations.slice(0, 5).map(v => ({
      rule: v.id,
      description: v.description,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
    }));

    return {
      provider: 'fallback',
      vertical,
      summary: `Found ${violations.length} accessibility violations requiring attention.`,
      topIssues,
      industryContext: `For ${config.name}, these violations may impact ${config.description}.`,
      compliance: {
        level: config.compliance.level,
        standards: config.compliance.standards,
        requiredScore: config.compliance.requiredScore,
      },
      recommendation: `Address violations in order of ${vertical} priority. Focus on ${config.priorityRules[0]?.rule} first.`,
      note: 'AI-powered remediation unavailable. Configure GROK_API_KEY or GEMINI_API_KEY for enhanced guidance.',
    };
  }

  /**
   * Update metrics
   */
  updateMetrics(startTime) {
    const duration = Date.now() - startTime;
    const totalCalls = this.metrics.grokCalls + this.metrics.geminiFallbacks;

    this.metrics.avgResponseTime =
      ((this.metrics.avgResponseTime * (totalCalls - 1)) + duration) / totalCalls;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      grokCalls: this.metrics.grokCalls,
      geminiFallbacks: this.metrics.geminiFallbacks,
      errors: this.metrics.errors,
      avgResponseTime: Math.round(this.metrics.avgResponseTime),
      provider: this.grokApiKey ? 'grok' : (this.geminiApiKey ? 'gemini' : 'fallback'),
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.grokApiKey && !this.geminiApiKey) {
      return {
        status: 'degraded',
        message: 'No AI provider configured (using fallback mode)',
      };
    }

    return {
      status: 'healthy',
      message: `Using ${this.grokApiKey ? 'Grok (xAI)' : 'Gemini (Google)'} for AI remediation`,
    };
  }
}

// Singleton instance
let grokServiceInstance = null;

function getGrokAIService() {
  if (!grokServiceInstance) {
    grokServiceInstance = new GrokAIService();
  }
  return grokServiceInstance;
}

module.exports = {
  GrokAIService,
  getGrokAIService,
};
