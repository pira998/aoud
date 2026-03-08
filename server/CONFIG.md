# Model Configuration Guide

This guide explains how to configure models, pricing, and beta features in Aoud using the `model-overrides.json` configuration file.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration File Structure](#configuration-file-structure)
- [Beta Headers](#beta-headers)
- [Model Overrides](#model-overrides)
- [Extended Model Variants](#extended-model-variants)
- [Examples](#examples)
- [Cache Configuration](#cache-configuration)
- [Hot Reloading](#hot-reloading)

## Quick Start

The configuration file is located at:
```
/server/config/model-overrides.json
```

If this file doesn't exist, the bridge will use hardcoded fallback models.

## Configuration File Structure

```json
{
  "version": "1.0.0",
  "description": "Model configuration overrides for Aoud",

  "betaHeaders": {
    "beta-key": {
      "header": "beta-header-value",
      "description": "Human-readable description",
      "supportedModels": ["model-id-1", "model-id-2"]
    }
  },

  "modelOverrides": {
    "model-id": {
      "displayName": "Model Name",
      "alias": "short-alias",
      "description": "Model description",
      "contextWindow": 200000,
      "pricing": { /* pricing config */ },
      "enabled": true,
      "extended": { /* extended variants */ }
    }
  }
}
```

## Beta Headers

Beta headers enable experimental features like extended context windows. They're passed to the Claude SDK via the `betaTag` parameter.

### Structure

```json
{
  "betaHeaders": {
    "1m-context": {
      "header": "context-1m-2025-08-07",
      "description": "Extended 1M token context window",
      "supportedModels": [
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-6"
      ]
    }
  }
}
```

### Fields

- **`header`** (required): The beta header value to pass to the SDK
- **`description`** (required): Human-readable description for UI/logs
- **`supportedModels`** (required): Array of model IDs that support this beta feature

### Example: Adding a New Beta Header

When Anthropic releases a new beta (e.g., 2M context), simply add it to the config:

```json
{
  "betaHeaders": {
    "1m-context": {
      "header": "context-1m-2025-08-07",
      "description": "1M token context window",
      "supportedModels": ["claude-sonnet-4-5-20250929", "claude-opus-4-6"]
    },
    "2m-context": {
      "header": "context-2m-2026-03-01",
      "description": "2M token context window",
      "supportedModels": ["claude-opus-5"]
    }
  }
}
```

No code changes needed! Just restart the server.

## Model Overrides

Model overrides define the metadata for each Claude model.

### Structure

```json
{
  "modelOverrides": {
    "claude-sonnet-4-5-20250929": {
      "displayName": "Sonnet 4.5",
      "alias": "sonnet",
      "description": "Fast daily coding",
      "contextWindow": 200000,
      "pricing": {
        "input": 0.000003,
        "output": 0.000015,
        "cacheWrite": 0.00000375,
        "cacheRead": 0.0000003
      },
      "enabled": true
    }
  }
}
```

### Fields

- **`displayName`** (optional): Name shown in UI
- **`alias`** (optional): Short alias for quick selection (e.g., `sonnet`, `opus`)
- **`description`** (optional): Description shown in model selector
- **`contextWindow`** (optional): Context window size in tokens (default: 200000)
- **`pricing`** (optional): Pricing rates in $/token
  - `input`: Input token rate
  - `output`: Output token rate
  - `cacheWrite`: Cache write rate (typically 1.25x input)
  - `cacheRead`: Cache read rate (typically 0.1x input)
- **`enabled`** (optional): Whether this model is selectable (default: true)
- **`extended`** (optional): Extended variants (see below)

## Extended Model Variants

Extended variants allow you to define multiple configurations for the same base model (e.g., standard 200K vs extended 1M context).

### Structure

```json
{
  "modelOverrides": {
    "claude-sonnet-4-5-20250929": {
      "displayName": "Sonnet 4.5",
      "alias": "sonnet",
      "contextWindow": 200000,
      "pricing": { /* standard pricing */ },
      "enabled": true,

      "extended": {
        "1m-context": {
          "displayName": "Sonnet 4.5 (1M)",
          "alias": "sonnet-1m",
          "description": "Fast coding with 1M context",
          "contextWindow": 1000000,
          "pricing": {
            "input": 0.000003,
            "output": 0.000015,
            "cacheWrite": 0.00000375,
            "cacheRead": 0.0000003,
            "inputOver200k": 0.000006,
            "outputOver200k": 0.0000225
          }
        }
      }
    }
  }
}
```

### Extended Variant Fields

- **`displayName`** (required): Name for the extended variant
- **`alias`** (optional): Alias for the extended variant (e.g., `sonnet-1m`)
- **`description`** (required): Description for the extended variant
- **`contextWindow`** (required): Context window size for this variant
- **`pricing`** (required): Pricing for this variant
  - Includes `inputOver200k` and `outputOver200k` for tiered pricing

### How It Works

1. The bridge generates **two separate model entries**:
   - Standard variant: `claude-sonnet-4-5-20250929` (200K context)
   - Extended variant: `claude-sonnet-4-5-20250929` with `betaTag: "context-1m-2025-08-07"` (1M context)

2. The extended variant is linked to the beta header via the key (`"1m-context"`)

3. When the extended model is selected, the bridge automatically passes the beta header to the SDK

## Examples

### Example 1: Adding a New Model

When Anthropic releases "Claude Haiku 5":

```json
{
  "modelOverrides": {
    "claude-haiku-5-20260101": {
      "displayName": "Haiku 5",
      "alias": "haiku5",
      "description": "Ultra-fast and efficient",
      "contextWindow": 200000,
      "pricing": {
        "input": 0.0000008,
        "output": 0.000004,
        "cacheWrite": 0.000001,
        "cacheRead": 0.00000008
      },
      "enabled": true
    }
  }
}
```

### Example 2: Updating Pricing

If Anthropic changes pricing for Opus:

```json
{
  "modelOverrides": {
    "claude-opus-4-6": {
      "pricing": {
        "input": 0.000004,  // Updated from 0.000005
        "output": 0.000020,  // Updated from 0.000025
        "cacheWrite": 0.000005,
        "cacheRead": 0.0000004
      }
    }
  }
}
```

### Example 3: Disabling a Model

To hide Haiku from the model selector:

```json
{
  "modelOverrides": {
    "claude-haiku-4-5-20251001": {
      "enabled": false
    }
  }
}
```

### Example 4: Adding 2M Context Support

When 2M context becomes available:

```json
{
  "betaHeaders": {
    "2m-context": {
      "header": "context-2m-2026-03-01",
      "description": "2M token context window",
      "supportedModels": ["claude-opus-5"]
    }
  },

  "modelOverrides": {
    "claude-opus-5": {
      "displayName": "Opus 5",
      "alias": "opus5",
      "contextWindow": 200000,
      "pricing": { /* standard pricing */ },

      "extended": {
        "2m-context": {
          "displayName": "Opus 5 (2M)",
          "alias": "opus5-2m",
          "description": "Maximum reasoning with 2M context",
          "contextWindow": 2000000,
          "pricing": {
            "input": 0.000008,
            "output": 0.000040,
            "cacheWrite": 0.000010,
            "cacheRead": 0.0000008,
            "inputOver200k": 0.000016,
            "outputOver200k": 0.000060
          }
        }
      }
    }
  }
}
```

## Cache Configuration

### Model List Cache TTL

By default, the bridge caches the model list for **1 week** (604800000 ms) to minimize API calls to Anthropic.

You can customize this via the `MODEL_CACHE_TTL` environment variable:

```bash
# Cache for 1 month
MODEL_CACHE_TTL=2592000000 aoud start

# Cache for 1 day (for testing)
MODEL_CACHE_TTL=86400000 aoud start

# Cache for 5 minutes (for active development)
MODEL_CACHE_TTL=300000 npm run dev
```

**Why 1 week?**
- Model list changes infrequently (typically monthly)
- Reduces unnecessary API calls
- Prevents rate limiting
- Still fresh enough for new releases

**When to lower it:**
- During active development
- Testing new model configurations
- Immediately after Anthropic announces new models

## Hot Reloading

### Manual Reload

To reload the configuration without restarting the server:

1. Edit `model-overrides.json`
2. Send a `reloadConfig` message via WebSocket (not yet implemented)
3. Or restart the server

### Automatic Reload (Future)

Future versions may support file watching:

```typescript
fs.watch('config/model-overrides.json', () => {
  console.log('[ModelRegistry] Config changed, reloading...');
  reloadConfig();
});
```

## Validation

The bridge validates the configuration on load:

- **Missing beta headers**: Warns if an extended variant references a non-existent beta key
- **Unsupported models**: Warns if a model in `supportedModels` doesn't have an override
- **Invalid JSON**: Falls back to hardcoded models if JSON is malformed

Check server logs on startup for validation warnings:

```
[ModelRegistry] Loaded model configuration from /path/to/model-overrides.json
[ModelRegistry] Config has 1 beta headers, 3 model overrides
```

## Fallback Behavior

If the configuration file is missing or invalid:

1. The bridge logs a warning
2. Falls back to hardcoded `FALLBACK_MODELS` in `model-registry.ts`
3. Continues operating normally

This ensures the bridge always works, even without a config file.

## Best Practices

1. **Keep pricing up-to-date**: Check Anthropic's pricing page quarterly
2. **Test new configs**: Use `MODEL_CACHE_TTL=60000` (1 min) for testing
3. **Document changes**: Add comments to explain pricing sources
4. **Version control**: Commit `model-overrides.json` to track changes
5. **Validate JSON**: Use `jq` or a JSON validator before deploying

```bash
# Validate JSON syntax
jq . server/config/model-overrides.json

# Pretty-print
jq . server/config/model-overrides.json > temp.json && mv temp.json server/config/model-overrides.json
```

## Troubleshooting

### Models not appearing in UI

1. Check `enabled: true` in config
2. Verify model ID matches Anthropic API
3. Check server logs for validation errors
4. Try `MODEL_CACHE_TTL=60000` to force fresh fetch

### Beta header not working

1. Confirm model is in `supportedModels` array
2. Check beta header value matches Anthropic docs
3. Verify the extended variant references the correct beta key

### Pricing incorrect

1. Check Anthropic's pricing page: https://anthropic.com/pricing
2. Update `pricing` object in config
3. Restart server or clear cache

## Migration from Hardcoded Models

If you're migrating from hardcoded `FALLBACK_MODELS`:

1. Copy current `FALLBACK_MODELS` structure
2. Convert to `model-overrides.json` format
3. Test with `npm run dev`
4. Remove hardcoded entries once config is working

The bridge maintains backward compatibility — if the config file is missing, it uses the hardcoded fallback models.

## Configuration Schema (Future)

Future versions may include a JSON Schema for validation:

```json
{
  "$schema": "./model-overrides.schema.json",
  "version": "1.0.0",
  ...
}
```

This would enable IDE autocomplete and validation in editors like VS Code.

## Support

For questions or issues with model configuration:

1. Check server logs for validation errors
2. Verify JSON syntax with `jq`
3. Review this documentation
4. Open an issue on GitHub with your config file (redact sensitive info)
