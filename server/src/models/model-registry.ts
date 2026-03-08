/**
 * Model Registry
 *
 * Centralized model management with dynamic fetching from Anthropic API,
 * caching, and fallback to hardcoded models.
 */

import type { ModelConfig, ModelOverridesConfig } from './model-config.js';
import { log } from '../logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load configuration from model-overrides.json
 * Returns null if file doesn't exist or is invalid
 */
function loadConfig(): ModelOverridesConfig | null {
  if (configCache) {
    return configCache;
  }

  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      log.debug('ModelRegistry', `Config file not found at ${CONFIG_PATH}, using fallback models`);
      return null;
    }

    const fileContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
    configCache = JSON.parse(fileContent) as ModelOverridesConfig;

    log.info('ModelRegistry', `Loaded model configuration from ${CONFIG_PATH}`);
    log.debug('ModelRegistry', `Config has ${Object.keys(configCache.betaHeaders || {}).length} beta headers, ${Object.keys(configCache.modelOverrides || {}).length} model overrides`);

    return configCache;
  } catch (error) {
    log.warn('ModelRegistry', `Failed to load config from ${CONFIG_PATH}, using fallback models`, error);
    return null;
  }
}

/**
 * Generate ModelConfig entries from configuration file
 * Creates both standard and extended (1M) variants based on config
 */
function generateModelsFromConfig(): ModelConfig[] {
  const config = loadConfig();
  if (!config) {
    return [];
  }

  const models: ModelConfig[] = [];

  // Process each model override
  for (const [modelId, override] of Object.entries(config.modelOverrides)) {
    // Standard variant
    models.push({
      id: modelId,
      name: override.displayName || modelId,
      alias: override.alias,
      description: override.description || '',
      contextWindow: override.contextWindow || 200000,
      supportsBeta: false,
      pricing: {
        input: override.pricing?.input || 0,
        output: override.pricing?.output || 0,
        cacheWrite: override.pricing?.cacheWrite || 0,
        cacheRead: override.pricing?.cacheRead || 0,
      },
      enabled: override.enabled ?? true,
      category: 'standard',
    });

    // Extended variants (e.g., 1M context)
    if (override.extended) {
      for (const [betaKey, extendedConfig] of Object.entries(override.extended)) {
        const betaHeaderConfig = config.betaHeaders[betaKey];

        if (!betaHeaderConfig) {
          log.warn('ModelRegistry', `Beta header '${betaKey}' referenced but not defined in config`);
          continue;
        }

        // Check if this model is in supported list
        if (!betaHeaderConfig.supportedModels.includes(modelId)) {
          log.warn('ModelRegistry', `Model '${modelId}' has extended config for '${betaKey}' but not in supportedModels list`);
        }

        models.push({
          id: modelId,
          name: extendedConfig.displayName,
          alias: extendedConfig.alias,
          description: extendedConfig.description,
          contextWindow: extendedConfig.contextWindow,
          supportsBeta: true,
          betaTag: betaHeaderConfig.header,
          pricing: {
            input: extendedConfig.pricing.input,
            output: extendedConfig.pricing.output,
            cacheWrite: extendedConfig.pricing.cacheWrite,
            cacheRead: extendedConfig.pricing.cacheRead,
            inputOver200k: extendedConfig.pricing.inputOver200k,
            outputOver200k: extendedConfig.pricing.outputOver200k,
          },
          enabled: override.enabled ?? true,
          category: '1m-context',
        });
      }
    }
  }

  return models;
}

/**
 * Fallback models used when API fetch fails or API key is not available.
 * Includes both standard (200K) and extended (1M) context models.
 *
 * Note: These are now primarily used as a fallback. The configuration file
 * (model-overrides.json) is the preferred source of model definitions.
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  // Standard Models (200K context)
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    alias: 'sonnet',
    description: 'Fast daily coding',
    contextWindow: 200000,
    supportsBeta: false,
    pricing: {
      input: 0.000003,        // $3/MTok
      output: 0.000015,       // $15/MTok
      cacheWrite: 0.00000375, // $3.75/MTok (25% more)
      cacheRead: 0.0000003,   // $0.30/MTok (90% less)
    },
    enabled: true,
    category: 'standard',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    alias: 'sonnet46',
    description: 'Best speed and intelligence',
    contextWindow: 200000,
    supportsBeta: false,
    pricing: {
      input: 0.000003,        // $3/MTok
      output: 0.000015,       // $15/MTok
      cacheWrite: 0.00000375, // $3.75/MTok (25% more)
      cacheRead: 0.0000003,   // $0.30/MTok (90% less)
    },
    enabled: true,
    category: 'standard',
  },
  {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    alias: 'opus',
    description: 'Complex reasoning',
    contextWindow: 200000,
    supportsBeta: false,
    pricing: {
      input: 0.000005,        // $5/MTok
      output: 0.000025,       // $25/MTok
      cacheWrite: 0.00000625, // $6.25/MTok (25% more)
      cacheRead: 0.0000005,   // $0.50/MTok (90% less)
    },
    enabled: true,
    category: 'standard',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    alias: 'haiku',
    description: 'Quick & efficient',
    contextWindow: 200000,
    supportsBeta: false,
    pricing: {
      input: 0.000001,        // $1/MTok
      output: 0.000005,       // $5/MTok
      cacheWrite: 0.00000125, // $1.25/MTok (25% more)
      cacheRead: 0.0000001,   // $0.10/MTok (90% less)
    },
    enabled: true,
    category: 'standard',
  },
  // Extended Context Models (1M context)
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5 (1M)',
    alias: 'sonnet-1m',
    description: 'Fast coding with 1M context',
    contextWindow: 1000000,
    supportsBeta: true,
    betaTag: 'context-1m-2025-08-07',
    pricing: {
      input: 0.000003,        // $3/MTok
      output: 0.000015,       // $15/MTok
      cacheWrite: 0.00000375, // $3.75/MTok
      cacheRead: 0.0000003,   // $0.30/MTok
      inputOver200k: 0.000006,  // $6/MTok (2x for >200K)
      outputOver200k: 0.0000225, // $22.50/MTok (1.5x for >200K)
    },
    enabled: true,
    category: '1m-context',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6 (1M)',
    alias: 'sonnet46-1m',
    description: 'Best speed and intelligence with 1M context',
    contextWindow: 1000000,
    supportsBeta: true,
    betaTag: 'context-1m-2025-08-07',
    pricing: {
      input: 0.000003,        // $3/MTok
      output: 0.000015,       // $15/MTok
      cacheWrite: 0.00000375, // $3.75/MTok
      cacheRead: 0.0000003,   // $0.30/MTok
      inputOver200k: 0.000006,  // $6/MTok (2x for >200K)
      outputOver200k: 0.0000225, // $22.50/MTok (1.5x for >200K)
    },
    enabled: true,
    category: '1m-context',
  },
  {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6 (1M)',
    alias: 'opus-1m',
    description: 'Complex reasoning with 1M context',
    contextWindow: 1000000,
    supportsBeta: true,
    betaTag: 'context-1m-2025-08-07',
    pricing: {
      input: 0.000005,        // $5/MTok
      output: 0.000025,       // $25/MTok
      cacheWrite: 0.00000625, // $6.25/MTok
      cacheRead: 0.0000005,   // $0.50/MTok
      inputOver200k: 0.000010,  // $10/MTok (2x for >200K)
      outputOver200k: 0.0000375, // $37.50/MTok (1.5x for >200K)
    },
    enabled: true,
    category: '1m-context',
  },
];

/**
 * Cache for fetched models with timestamp
 */
interface ModelCache {
  models: ModelConfig[];
  fetchedAt: number;
}

let modelCache: ModelCache | null = null;

/**
 * Cache TTL in milliseconds
 * Default: 1 week (604800000 ms)
 * Override with MODEL_CACHE_TTL environment variable
 */
const DEFAULT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week
const CACHE_TTL = parseInt(process.env.MODEL_CACHE_TTL || String(DEFAULT_CACHE_TTL), 10);

// Log cache TTL on startup
log.info('ModelRegistry', `Model cache TTL: ${CACHE_TTL}ms (${(CACHE_TTL / 1000 / 60 / 60 / 24).toFixed(1)} days)`);

/**
 * Configuration file path
 */
const CONFIG_PATH = path.join(__dirname, '../../config/model-overrides.json');

/**
 * Loaded configuration (lazy-loaded on first access)
 */
let configCache: ModelOverridesConfig | null = null;

/**
 * Fetch models from Anthropic API
 * Returns config-based or fallback models if API fetch fails or API key is missing
 */
async function fetchModelsFromAPI(): Promise<ModelConfig[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Try config-based models first
  const configModels = generateModelsFromConfig();
  const defaultModels = configModels.length > 0 ? configModels : FALLBACK_MODELS;

  // No API key - use config/fallback
  if (!apiKey) {
    log.warn('ModelRegistry', 'No ANTHROPIC_API_KEY found, using config/fallback models');
    return defaultModels;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();

    // API response format: { data: Array<{ id, created_at, display_name, type }>, has_more, first_id, last_id }
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid API response format');
    }

    log.info('ModelRegistry', `Fetched ${data.data.length} models from Anthropic API`);

    // Map API models to our ModelConfig format
    // Merge with config/fallback models to get pricing and context window info
    return mapAPIModelsToConfig(data.data as any[], defaultModels);
  } catch (error) {
    log.warn('ModelRegistry', 'Failed to fetch models from API, using config/fallback', error);
    return defaultModels;
  }
}

/**
 * Map API model data to our ModelConfig format
 * Enriches API data with pricing and context window info from config/fallback models
 */
function mapAPIModelsToConfig(apiModels: any[], referenceModels: ModelConfig[]): ModelConfig[] {
  // For now, just use reference models since API doesn't provide pricing/context info
  // In the future, this could intelligently merge API data with our config metadata
  // TODO: Implement smart merging when API provides more metadata

  // Create a set of model IDs from API for validation
  const apiModelIds = new Set(apiModels.map((m: any) => m.id));

  // Filter reference models to only include those that exist in API response
  // If API has models we don't know about, log a warning
  const knownModels = referenceModels.filter(model => {
    // For 1M variants, check if base model ID exists in API
    const baseModelId = model.id;
    return apiModelIds.has(baseModelId);
  });

  // Log any API models we don't have metadata for
  apiModels.forEach((apiModel: any) => {
    const hasMetadata = referenceModels.some(m => m.id === apiModel.id);
    if (!hasMetadata) {
      log.info('ModelRegistry', `API returned model without local metadata: ${apiModel.id} (${apiModel.display_name})`);
    }
  });

  // If we found matches, use them; otherwise fall back to all reference models
  return knownModels.length > 0 ? knownModels : referenceModels;
}

/**
 * Get available models with caching
 * @param forceRefresh - Skip cache and fetch fresh data
 */
export async function getAvailableModels(forceRefresh = false): Promise<ModelConfig[]> {
  // Check cache
  if (!forceRefresh && modelCache && Date.now() - modelCache.fetchedAt < CACHE_TTL) {
    log.debug('ModelRegistry', 'Returning cached models');
    return modelCache.models;
  }

  // Fetch fresh data
  log.debug('ModelRegistry', 'Fetching models (cache miss or force refresh)');
  const models = await fetchModelsFromAPI();

  // Update cache
  modelCache = {
    models,
    fetchedAt: Date.now(),
  };

  return models;
}

/**
 * Get configuration for a specific model by ID
 * @param modelId - Full model ID or alias
 * @returns Model config or undefined if not found
 */
export function getModelConfig(modelId: string | undefined): ModelConfig | undefined {
  if (!modelId) return undefined;

  // Use cached models if available, otherwise use fallback
  const models = modelCache?.models || FALLBACK_MODELS;

  // Try alias match FIRST (aliases are unique across variants, IDs are shared)
  // e.g., "opus" vs "opus-1m" both have id "claude-opus-4-6" but unique aliases
  let config = models.find(m => m.alias === modelId);

  // Try exact ID match
  if (!config) {
    config = models.find(m => m.id === modelId);
  }

  // Try partial match (for backward compatibility with display names)
  if (!config) {
    config = models.find(m => modelId.includes(m.id));
  }

  return config;
}

/**
 * Resolve a model alias to full model ID
 * @param alias - Short alias (e.g., 'sonnet', 'opus-1m')
 * @returns Full model ID or undefined if not found
 */
export function resolveAlias(alias: string): string | undefined {
  const models = modelCache?.models || FALLBACK_MODELS;
  const model = models.find(m => m.alias === alias);
  return model?.id;
}

/**
 * Get all available aliases mapped to their full IDs
 */
export function getAllAliases(): Record<string, string> {
  const models = modelCache?.models || FALLBACK_MODELS;
  const aliases: Record<string, string> = {};

  models.forEach(model => {
    if (model.alias) {
      aliases[model.alias] = model.id;
    }
  });

  return aliases;
}

/**
 * Check if a model supports beta features (1M context)
 */
export function modelSupportsBeta(modelId: string | undefined): boolean {
  const config = getModelConfig(modelId);
  return config?.supportsBeta ?? false;
}

/**
 * Get beta tag for a model (if supported)
 */
export function getModelBetaTag(modelId: string | undefined): string | undefined {
  const config = getModelConfig(modelId);
  return config?.betaTag;
}

/**
 * Clear the model cache (useful for testing or forcing refresh)
 */
export function clearModelCache(): void {
  modelCache = null;
  log.info('ModelRegistry', 'Model cache cleared');
}

/**
 * Clear the configuration cache and reload from disk
 * Useful for hot-reloading configuration changes
 */
export function reloadConfig(): void {
  configCache = null;
  modelCache = null; // Also clear model cache to pick up new config
  log.info('ModelRegistry', 'Configuration cache cleared, will reload on next access');
}

/**
 * Get the current cache TTL setting
 */
export function getCacheTTL(): number {
  return CACHE_TTL;
}
