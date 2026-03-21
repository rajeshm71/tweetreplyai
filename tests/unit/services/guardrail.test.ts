import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('groq-sdk', () => ({
  Groq: class {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

// Helpers to stub and restore GROQ_API_KEY
const savedGroqKey = process.env.GROQ_API_KEY;

describe('Guardrail Service - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env var
    if (savedGroqKey) {
      process.env.GROQ_API_KEY = savedGroqKey;
    } else {
      delete process.env.GROQ_API_KEY;
    }
  });

  describe('runGuardrail — when Groq is NOT configured', () => {
    it('returns safe result without calling SDK when API key is absent', async () => {
      // Reload module with no key
      delete process.env.GROQ_API_KEY;
      vi.resetModules();
      const { runGuardrail } = await import('../../../server/services/guardrail');

      const result = await runGuardrail('Some user text');

      expect(result.violation).toBe(0);
      expect(result.category).toBeNull();
      expect(result.rationale).toMatch(/Guardrail disabled/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('runGuardrail — when Groq is configured', () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = 'test-key';
      vi.resetModules();
    });

    it('returns violation:0 when Groq returns clean result', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ violation: 0, category: null, rationale: 'all good' }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const { runGuardrail } = await import('../../../server/services/guardrail');
      const result = await runGuardrail('Nice tweet reply');

      expect(result.violation).toBe(0);
      expect(result.category).toBeNull();
    });

    it('returns violation:1 with category when Groq flags content', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ violation: 1, category: 'hate_speech', rationale: 'Hateful content detected.' }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const { runGuardrail } = await import('../../../server/services/guardrail');
      const result = await runGuardrail('Offensive content here');

      expect(result.violation).toBe(1);
      expect(result.category).toBe('hate_speech');
      expect(result.rationale).toBe('Hateful content detected.');
    });

    it('returns violation:0 fallback when Groq returns malformed JSON', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {{' } }],
        usage: {},
      });

      const { runGuardrail } = await import('../../../server/services/guardrail');
      const result = await runGuardrail('Any text');

      expect(result.violation).toBe(0);
      expect(() => result).not.toThrow();
    });

    it('returns safe fallback when Groq SDK throws', async () => {
      mockCreate.mockRejectedValue(new Error('Groq API error'));

      const { runGuardrail } = await import('../../../server/services/guardrail');
      const result = await runGuardrail('Any text');

      expect(result.violation).toBe(0);
      expect(result.rationale).toMatch(/Guardrail error/i);
    });

    it('truncates input longer than 500 chars before calling Groq', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ violation: 0, category: null, rationale: 'ok' }) } }],
        usage: {},
      });

      const { generateGuardrailFriendlyReply } = await import('../../../server/services/guardrail');
      const longInput = 'a'.repeat(600);
      await generateGuardrailFriendlyReply(longInput, 'some rationale');

      const calledContent = mockCreate.mock.calls[0]?.[0]?.messages?.[1]?.content as string;
      // The user message context should contain the truncation marker
      expect(calledContent).toContain('...');
      // The 600-char input should NOT appear in full (it gets sliced to 500 + "...")
      expect(calledContent).not.toContain('a'.repeat(600));
    });
  });

  describe('generateGuardrailFriendlyReply — when Groq is NOT configured', () => {
    it('returns hardcoded fallback reply without calling SDK', async () => {
      delete process.env.GROQ_API_KEY;
      vi.resetModules();
      const { generateGuardrailFriendlyReply } = await import('../../../server/services/guardrail');

      const result = await generateGuardrailFriendlyReply('some text', 'some rationale');

      expect(result.reply).toMatch(/sit this one out/i);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('generateGuardrailFriendlyReply — when Groq errors', () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = 'test-key';
      vi.resetModules();
    });

    it('returns second fallback reply when Groq throws', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const { generateGuardrailFriendlyReply } = await import('../../../server/services/guardrail');
      const result = await generateGuardrailFriendlyReply('some text', 'rationale');

      expect(result.reply).toMatch(/pass on that one/i);
      expect(result.reply).not.toBeUndefined();
    });
  });
});
