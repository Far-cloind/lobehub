import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getCodexHome } from '@lobechat/heterogeneous-agents/spawn';

export interface CodexRateLimitWindow {
  resetsAt: number;
  usedPercent: number;
  windowMinutes: number;
}

export interface LocalCodexStatus {
  contextRemaining?: number;
  contextWindow?: number;
  model?: string;
  planType?: string;
  primary?: CodexRateLimitWindow;
  secondary?: CodexRateLimitWindow;
  updatedAt: string;
  usedTokens?: number;
}

export interface LocalCodexSkill {
  description?: string;
  name: string;
  path: string;
  source: 'codex-system' | 'project' | 'user';
}

export interface LocalCodexModel {
  contextWindow?: number;
  description?: string;
  displayName: string;
  slug: string;
}

const sessionFileCache = new Map<string, string>();

const toWindow = (value: any): CodexRateLimitWindow | undefined => {
  if (
    typeof value?.used_percent !== 'number' ||
    typeof value?.window_minutes !== 'number' ||
    typeof value?.resets_at !== 'number'
  ) {
    return;
  }

  return {
    resetsAt: value.resets_at,
    usedPercent: value.used_percent,
    windowMinutes: value.window_minutes,
  };
};

const collectSessionFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSessionFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.jsonl') ? [entryPath] : [];
    }),
  );

  return nested.flat();
};

const readLatestStatusFromFile = async (
  filePath: string,
): Promise<LocalCodexStatus | undefined> => {
  const content = await readFile(filePath, 'utf8').catch(() => undefined);
  if (!content) return;

  const lines = content.split(/\r?\n/);
  let model: string | undefined;
  let status: LocalCodexStatus | undefined;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if (!model && record?.type === 'turn_context' && typeof record?.payload?.model === 'string') {
        model = record.payload.model;
      }
      if (status && model) return { ...status, model };
      if (status) continue;

      const rateLimits = record?.payload?.rate_limits;
      if (!rateLimits) continue;

      const primary = toWindow(rateLimits.primary);
      const secondary = toWindow(rateLimits.secondary);
      if (!primary && !secondary) continue;
      const contextWindow =
        typeof record?.payload?.info?.model_context_window === 'number'
          ? record.payload.info.model_context_window
          : undefined;
      const usedTokens =
        typeof record?.payload?.info?.total_token_usage?.total_tokens === 'number'
          ? record.payload.info.total_token_usage.total_tokens
          : undefined;

      status = {
        contextRemaining:
          contextWindow && usedTokens !== undefined
            ? Math.max(0, contextWindow - usedTokens)
            : undefined,
        contextWindow,
        planType: typeof rateLimits.plan_type === 'string' ? rateLimits.plan_type : undefined,
        primary,
        secondary,
        updatedAt:
          typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString(),
        usedTokens,
      };
    } catch {
      continue;
    }
  }

  return status ? { ...status, model } : undefined;
};

export const getLocalCodexStatus = async (
  sessionId?: string,
): Promise<LocalCodexStatus | undefined> => {
  if (sessionId) {
    const cachedPath = sessionFileCache.get(sessionId);
    if (cachedPath) return readLatestStatusFromFile(cachedPath);
  }

  const sessionsDir = path.join(getCodexHome(process.env), 'sessions');
  const files = await collectSessionFiles(sessionsDir);
  if (sessionId) {
    const sessionFile = files.find((filePath) => path.basename(filePath).includes(sessionId));
    if (sessionFile) {
      sessionFileCache.set(sessionId, sessionFile);
      return readLatestStatusFromFile(sessionFile);
    }
    return;
  }

  const filesWithMtime = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      mtimeMs: (await stat(filePath).catch(() => undefined))?.mtimeMs ?? 0,
    })),
  );

  filesWithMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const file of filesWithMtime.slice(0, 20)) {
    const status = await readLatestStatusFromFile(file.filePath);
    if (status) return status;
  }
};

const parseSkillFrontmatter = (content: string, fallbackName: string): LocalCodexSkill => {
  const parseScalar = (value: string) => {
    const trimmed = value.trim();
    if (
      trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };

  const lines = content.split(/\r?\n/);
  let name = fallbackName;
  let description: string | undefined;
  if (lines[0]?.trim() === '---') {
    for (const line of lines.slice(1)) {
      if (line.trim() === '---') break;
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const key = line.slice(0, separator).trim();
      const value = parseScalar(line.slice(separator + 1));
      if (key === 'name' && value) name = value;
      if (key === 'description' && value) description = value;
    }
  }
  return { description, name, path: '', source: 'user' };
};

export const listLocalCodexSkills = async (): Promise<LocalCodexSkill[]> => {
  const cwd = process.env.LOCAL_CODEX_WORKING_DIR || process.cwd();
  const roots: Array<{ path: string; source: LocalCodexSkill['source'] }> = [
    { path: path.join(cwd, '.agents', 'skills'), source: 'project' },
    { path: path.join(os.homedir(), '.agents', 'skills'), source: 'user' },
    { path: path.join(getCodexHome(process.env), 'skills'), source: 'user' },
    { path: '/etc/codex/skills', source: 'codex-system' },
  ];
  const skills = new Map<string, LocalCodexSkill>();

  for (const root of roots) {
    const collectSkills = async (directory: string, depth = 0): Promise<void> => {
      if (depth > 1) return;
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules') continue;
        const skillDirectory = path.join(directory, entry.name);
        const skillPath = path.join(skillDirectory, 'SKILL.md');
        const source =
          root.path === path.join(getCodexHome(process.env), 'skills') &&
          skillDirectory.startsWith(path.join(root.path, '.system'))
            ? 'codex-system'
            : root.source;
        const content = await readFile(skillPath, 'utf8').catch(() => undefined);
        if (content) {
          const skill = parseSkillFrontmatter(content, entry.name);
          if (!skills.has(skill.name))
            skills.set(skill.name, { ...skill, path: skillPath, source });
        } else {
          await collectSkills(skillDirectory, depth + 1);
        }
      }
    };
    await collectSkills(root.path);
  }

  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const listLocalCodexModels = async (): Promise<LocalCodexModel[]> => {
  const cachePath = path.join(getCodexHome(process.env), 'models_cache.json');
  const content = await readFile(cachePath, 'utf8').catch(() => undefined);
  if (!content) return [];

  try {
    const cache = JSON.parse(content);
    if (!Array.isArray(cache?.models)) return [];

    return cache.models
      .filter((model: any) => model?.visibility === 'list' && typeof model?.slug === 'string')
      .map((model: any) => ({
        contextWindow: typeof model.context_window === 'number' ? model.context_window : undefined,
        description: typeof model.description === 'string' ? model.description : undefined,
        displayName: typeof model.display_name === 'string' ? model.display_name : model.slug,
        slug: model.slug,
      }));
  } catch {
    return [];
  }
};
