/**
 * Model Configuration Types
 *
 * Defines the structure for Claude model metadata including pricing,
 * context windows, and beta feature support.
 */

export interface ModelConfig {
  /** Full model ID (e.g., 'claude-sonnet-4-5-20250929') */
  id: string;

  /** Display name for UI (e.g., 'Sonnet 4.5') */
  name: string;

  /** Short alias for quick selection (e.g., 'sonnet', 'opus-1m') */
  alias?: string;

  /** Description shown in UI */
  description: string;

  /** Context window size in tokens (200000 or 1000000) */
  contextWindow: number;

  /** Whether this model requires beta headers */
  supportsBeta: boolean;

  /** Beta tag to pass to SDK (e.g., 'context-1m-2025-08-07') */
  betaTag?: string;

  /** Pricing information in $/token */
  pricing: {
    /** Input token rate ($/token) */
    input: number;

    /** Output token rate ($/token) */
    output: number;

    /** Cache write rate ($/token) */
    cacheWrite: number;

    /** Cache read rate ($/token) */
    cacheRead: number;

    /** Input rate for tokens >200K (1M context only) */
    inputOver200k?: number;

    /** Output rate for tokens >200K (1M context only) */
    outputOver200k?: number;
  };

  /** Whether this model is enabled for selection */
  enabled: boolean;

  /** Category for UI grouping */
  category: 'standard' | '1m-context';
}

/**
 * Configuration file structure for model overrides
 * Located at: /server/config/model-overrides.json
 */
export interface ModelOverridesConfig {
  /** Schema version for future migrations */
  version: string;

  /** Human-readable description */
  description?: string;

  /** Beta header definitions */
  betaHeaders: Record<string, BetaHeaderConfig>;

  /** Model-specific overrides */
  modelOverrides: Record<string, ModelOverride>;
}

/**
 * Beta header configuration (e.g., 1M context support)
 */
export interface BetaHeaderConfig {
  /** The header value to pass to SDK (e.g., 'context-1m-2025-08-07') */
  header: string;

  /** Human-readable description */
  description: string;

  /** List of model IDs that support this beta feature */
  supportedModels: string[];
}

/**
 * Model-specific configuration override
 */
export interface ModelOverride {
  /** Display name (overrides default) */
  displayName?: string;

  /** Short alias (e.g., 'sonnet', 'opus') */
  alias?: string;

  /** Description shown in UI */
  description?: string;

  /** Context window size in tokens */
  contextWindow?: number;

  /** Pricing information */
  pricing?: PricingConfig;

  /** Whether this model is enabled */
  enabled?: boolean;

  /** Extended variants (e.g., 1M context versions) */
  extended?: Record<string, ExtendedModelConfig>;
}

/**
 * Extended model configuration (e.g., 1M context variant)
 */
export interface ExtendedModelConfig {
  /** Display name for extended variant */
  displayName: string;

  /** Alias for extended variant (e.g., 'sonnet-1m') */
  alias?: string;

  /** Description for extended variant */
  description: string;

  /** Context window size for extended variant */
  contextWindow: number;

  /** Pricing for extended variant */
  pricing: PricingConfig;
}

/**
 * Pricing configuration
 */
export interface PricingConfig {
  /** Input token rate ($/token) */
  input: number;

  /** Output token rate ($/token) */
  output: number;

  /** Cache write rate ($/token) */
  cacheWrite: number;

  /** Cache read rate ($/token) */
  cacheRead: number;

  /** Input rate for tokens >200K (1M context only) */
  inputOver200k?: number;

  /** Output rate for tokens >200K (1M context only) */
  outputOver200k?: number;
}
