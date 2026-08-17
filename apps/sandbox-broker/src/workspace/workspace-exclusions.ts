/**
 * Re-export shim (Sandbox V2 M2 extraction).
 *
 * The sanitized-tree exclusions implementation now lives in the neutral
 * `@composer-assistant/sandbox-tree` package. This module preserves the
 * broker's existing module path and public surface unchanged; every export
 * name, type, and behavior is identical.
 */

export * from "@composer-assistant/sandbox-tree";