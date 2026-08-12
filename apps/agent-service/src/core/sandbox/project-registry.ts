/**
 * Agent-side durable project-root registry (Autonomous Engineering
 * Workstation wave).
 *
 * The allowlist is host/operator configuration. Ashley may READ it to decide
 * where she may engineer, but she can NEVER create or widen a project root.
 * This module validates the registry (delegating canonical/shape checks to the
 * shared policy module) and exposes read-only lookups.
 */

import {
  validateProjectRootRegistry,
  type ProjectRootEntry,
  type ProjectRootRegistry,
} from "@composer-assistant/sandbox-policy";
import { readFileSync } from "node:fs";

export class AgentProjectRegistry {
  private registry: ProjectRootRegistry;

  constructor(entries: ReadonlyArray<ProjectRootEntry>) {
    const validated = validateProjectRootRegistry(entries);
    if (!validated.ok) {
      throw new Error(`agent_project_registry_invalid:${validated.reasons.join(",")}`);
    }
    this.registry = validated.registry;
  }

  /** Reload from a host-provided JSON file (operator action, not model action). */
  static loadFromFile(path: string): AgentProjectRegistry {
    const raw = JSON.parse(readFileSync(path, "utf8")) as ProjectRootEntry[];
    return new AgentProjectRegistry(raw);
  }

  list(): ProjectRootEntry[] {
    return [...this.registry.entries.values()];
  }

  get(projectId: string): ProjectRootEntry | null {
    return this.registry.entries.get(projectId) ?? null;
  }

  isReadAllowed(projectId: string): boolean {
    return this.get(projectId)?.readAllowed ?? false;
  }

  isEngineeringAllowed(projectId: string): boolean {
    return this.get(projectId)?.engineeringAllowed ?? false;
  }

  isWorkspaceAllowed(projectId: string): boolean {
    return this.get(projectId)?.candidateWorkspaceAllowed ?? false;
  }
}
