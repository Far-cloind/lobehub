import type { AgentPromptInput, SpawnAgentHandle } from '@lobechat/heterogeneous-agents/spawn';
import { spawnAgent } from '@lobechat/heterogeneous-agents/spawn';
import debug from 'debug';

import { appEnv } from '@/envs/app';

import type { HeterogeneousAgentService } from '.';
import type { SandboxRunParams } from './sandboxRunner';

const log = debug('lobe-server:local-codex-runner');

interface LocalCodexRun {
  cancelled: boolean;
  handle: SpawnAgentHandle;
  userId: string;
}

const globalForLocalCodex = globalThis as unknown as {
  localCodexRuns?: Map<string, LocalCodexRun>;
};

const localCodexRuns = (globalForLocalCodex.localCodexRuns ??= new Map());

export interface LocalCodexRunParams extends Omit<
  SandboxRunParams,
  'agentType' | 'jwt' | 'marketService' | 'repos'
> {
  heterogeneousAgentService: HeterogeneousAgentService;
  model?: string;
}

/**
 * Build the system context that tells Codex about the file upload tool.
 * Injected as the first text block before every user prompt.
 */
const buildUploadToolContext = (): string => {
  // The server process runs from the LobeHub project root.
  // e.g. "cd ~/GitHub/lobehub && npx next start" → cwd is the project root.
  const lobehubRoot = process.cwd();
  const uploadScript = `${lobehubRoot}/scripts/codex-upload.mjs`;

  return `You are running inside LobeHub, a self-hosted AI chat platform.

## Sharing files with the user

When you generate images, documents, or any files the user should be able to view or download, use the upload script to share them:

  node ${uploadScript} <file-path> [<file-path> ...]

This command uploads files to cloud storage and prints markdown-formatted links.
Copy the printed markdown into your response so the user can click to view the files.

Important:
- ALWAYS use this when you generate images (PNG, JPG, SVG, WebP, etc.)
- Your generated images are typically saved under ~/.codex/generated_images/
- You can upload multiple files in one command
- The printed output is ready-to-use markdown — include it verbatim in your response
- For existing files the user asks you to share, use this tool to make them accessible`;
};

const buildPrompt = (params: LocalCodexRunParams): AgentPromptInput => {
  // Upload tool instruction always comes first.
  const textBlocks = [
    { text: buildUploadToolContext(), type: 'text' as const },
    ...(params.systemContext ? [{ text: params.systemContext, type: 'text' as const }] : []),
    { text: params.prompt, type: 'text' as const },
  ];

  const imageBlocks = (params.imageList ?? []).map((image) => ({
    source: { id: image.id, type: 'url' as const, url: image.url },
    type: 'image' as const,
  }));

  return [...textBlocks, ...imageBlocks];
};

export const cancelLocalCodexRun = (operationId: string, userId: string): boolean => {
  const run = localCodexRuns.get(operationId);
  if (!run || run.userId !== userId) return false;

  run.cancelled = true;
  run.handle.kill('SIGINT');
  return true;
};

/**
 * Run Codex on the LobeHub server host and feed its normalized events into the
 * existing heterogeneous persistence/stream pipeline.
 */
export const spawnLocalCodex = async (params: LocalCodexRunParams): Promise<void> => {
  const {
    assistantMessageId,
    heterogeneousAgentService,
    operationId,
    resumeSessionId,
    topicId,
    userId,
  } = params;

  if (localCodexRuns.has(operationId)) {
    throw new Error(`Local Codex operation is already running: ${operationId}`);
  }

  const command = appEnv.LOCAL_CODEX_COMMAND || 'codex';
  const cwd = params.cwd || appEnv.LOCAL_CODEX_WORKING_DIR || process.cwd();
  let run: LocalCodexRun | undefined;
  let stderr = '';

  try {
    const handle = await spawnAgent({
      agentType: 'codex',
      command,
      cwd,
      extraArgs: params.model ? ['--model', params.model] : undefined,
      includePartialMessages: true,
      operationId,
      prompt: buildPrompt(params),
      resumeSessionId,
    });
    run = { cancelled: false, handle, userId };
    localCodexRuns.set(operationId, run);

    handle.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8000);
    });

    log('spawnLocalCodex: user=%s op=%s cwd=%s command=%s', userId, operationId, cwd, command);

    for await (const event of handle.events) {
      if (run.cancelled) continue;
      await heterogeneousAgentService.heteroIngest({
        agentType: 'codex',
        assistantMessageId,
        events: [event],
        operationId,
        topicId,
      });
    }

    const exit = await handle.exit;
    const result = run.cancelled ? 'cancelled' : exit.code === 0 ? 'success' : 'error';
    const error =
      result === 'error'
        ? {
            message:
              stderr.trim() ||
              `Codex exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}`,
            type: 'LocalCodexProcessError',
          }
        : undefined;

    await heterogeneousAgentService.heteroFinish({
      agentType: 'codex',
      error,
      operationId,
      result,
      sessionId: handle.sessionId,
      topicId,
    });

    // The shared finish service keeps runningOperation intact for the first
    // cancelled notification because remote producers normally send a second
    // process-exit finish. This local runner owns both phases, so send that
    // cleanup handshake after the cancellation event.
    if (result === 'cancelled') {
      await heterogeneousAgentService.heteroFinish({
        agentType: 'codex',
        operationId,
        result: 'success',
        sessionId: handle.sessionId,
        topicId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('spawnLocalCodex failed: user=%s op=%s error=%s', userId, operationId, message);

    await heterogeneousAgentService.heteroFinish({
      agentType: 'codex',
      error: { message, type: 'LocalCodexSpawnError' },
      operationId,
      result: 'error',
      topicId,
    });
  } finally {
    localCodexRuns.delete(operationId);
  }
};
