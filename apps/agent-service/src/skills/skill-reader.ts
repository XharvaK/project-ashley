export type SkillManifest = {
  name: string;
  version?: string;
  description?: string;
  homepage?: string;
  baseUrl?: string;
  content: string;
};

export async function fetchSkillManifest(url: string): Promise<SkillManifest> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "composer-assistant/0.2 (skill-reader; +https://github.com/XharvaK)",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch skill manifest: HTTP ${res.status}`);
  }

  const text = await res.text();
  return parseSkillManifest(text);
}

export function parseSkillManifest(rawText: string): SkillManifest {
  let name = "unknown";
  let version = "1.0.0";
  let description = "";
  let homepage = "";
  let baseUrl = "";

  // Parse YAML frontmatter if present
  const fmMatch = /^---\s*\n([\s\S]*?)\n---/m.exec(rawText);
  if (fmMatch?.[1]) {
    const fm = fmMatch[1];
    const nameM = /^name:\s*(.+)$/m.exec(fm);
    if (nameM?.[1]) name = nameM[1].trim();

    const verM = /^version:\s*(.+)$/m.exec(fm);
    if (verM?.[1]) version = verM[1].trim();

    const descM = /^description:\s*(.+)$/m.exec(fm);
    if (descM?.[1]) description = descM[1].trim();

    const homeM = /^homepage:\s*(.+)$/m.exec(fm);
    if (homeM?.[1]) homepage = homeM[1].trim();
  }

  // Extract base URL
  const baseM = /\*\*Base URL:\*\*\s*`?(https:\/\/[^\s`]+)`?/i.exec(rawText);
  if (baseM?.[1]) {
    baseUrl = baseM[1].trim();
  }

  return {
    name,
    version,
    description,
    homepage,
    baseUrl,
    content: rawText,
  };
}
