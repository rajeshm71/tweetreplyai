CREATE TABLE IF NOT EXISTS platform_model_token_usage (
  tier_id TEXT NOT NULL,
  window_key TEXT NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  input_tokens_used BIGINT NOT NULL DEFAULT 0,
  output_tokens_used BIGINT NOT NULL DEFAULT 0,
  cached_tokens_used BIGINT NOT NULL DEFAULT 0,
  reasoning_tokens_used BIGINT NOT NULL DEFAULT 0,
  request_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tier_id, window_key)
);

CREATE OR REPLACE FUNCTION increment_platform_token_usage(
  p_tier_id TEXT,
  p_window_key TEXT,
  p_tokens BIGINT,
  p_input BIGINT,
  p_output BIGINT,
  p_cached BIGINT DEFAULT 0,
  p_reasoning BIGINT DEFAULT 0
) RETURNS BIGINT AS $$
DECLARE new_total BIGINT;
BEGIN
  INSERT INTO platform_model_token_usage (
    tier_id, window_key, tokens_used, input_tokens_used, output_tokens_used,
    cached_tokens_used, reasoning_tokens_used, request_count
  ) VALUES (
    p_tier_id, p_window_key, p_tokens, p_input, p_output, p_cached, p_reasoning, 1
  )
  ON CONFLICT (tier_id, window_key) DO UPDATE SET
    tokens_used = platform_model_token_usage.tokens_used + EXCLUDED.tokens_used,
    input_tokens_used = platform_model_token_usage.input_tokens_used + EXCLUDED.input_tokens_used,
    output_tokens_used = platform_model_token_usage.output_tokens_used + EXCLUDED.output_tokens_used,
    cached_tokens_used = platform_model_token_usage.cached_tokens_used + EXCLUDED.cached_tokens_used,
    reasoning_tokens_used = platform_model_token_usage.reasoning_tokens_used + EXCLUDED.reasoning_tokens_used,
    request_count = platform_model_token_usage.request_count + 1,
    updated_at = now()
  RETURNING tokens_used INTO new_total;
  RETURN new_total;
END;
$$ LANGUAGE plpgsql;
