export class ProviderUnavailableError extends Error {
  readonly code = 'PROVIDER_UNAVAILABLE';

  constructor(
    message: string,
    readonly provider: 'openai' | 'groq',
    readonly modelKey: string,
  ) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export function isDemoModelKey(modelKey: string): boolean {
  return modelKey === 'demo' || modelKey === 'demo-groq' || modelKey === 'guardrail-demo';
}
