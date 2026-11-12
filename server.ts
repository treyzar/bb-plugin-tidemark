import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { isAsyncQuestion, normalizePayload, targetSchema, validateAnswer, validateMessage } from './bridge.ts';

/** External client API. All routes use bb's independent per-plugin token. */
export default function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    project: { type: 'project', label: 'Project (empty = all projects)' },
  });
  type Thread = Awaited<ReturnType<typeof bb.sdk.threads.list>>[number];
  type Pending = { id: string; threadId: string; threadTitle: string; payload: unknown };
  const cache = new Map<string, { at: number; items: Pending[] }>();
  const versions = new Map<string, number>();
  const answering = new Set<string>();
  const invalidate = (id: string) => {
    cache.delete(id);
    versions.set(id, (versions.get(id) ?? 0) + 1);
  };
  bb.events.on('interaction.pending', ({ thread }) => invalidate(thread.id));
  bb.events.on('experimental_thread.events', ({ thread }) => {
    if (cache.get(thread.id)?.items.length) invalidate(thread.id);
  });
  bb.events.on('thread.idle', ({ thread }) => invalidate(thread.id));
  settings.onChange(() => cache.clear());

  async function permitted(threadId: string) {
    const thread = await bb.sdk.threads.get({ threadId });
    const { project } = await settings.get();
    if (project && thread.projectId !== project) throw new Error('Thread outside configured project');
    return thread;
  }

  bb.http.route('GET', '/state', async c => {
    const { project } = await settings.get();
    const threads: Thread[] = [];
    let incomplete = false;
    // Reconcile after reload; page beyond the SDK's default window.
    for (let offset = 0; offset < 1000; offset += 200) {
      const page = await bb.sdk.threads.list({ projectId: project, limit: 200, offset, includeHidden: false });
      threads.push(...page);
      if (page.length < 200) break;
      if (offset === 800) incomplete = true;
    }
    const ids = new Set(threads.map(t => t.id));
    for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
    for (const id of versions.keys()) if (!ids.has(id)) versions.delete(id);
    const interactions: Pending[] = [];
    // Cache quiet threads; events invalidate questions immediately. Refresh
    // periodically too, covering changes missed during reload/reconnection.
    for (let i = 0; i < threads.length; i += 8) {
      const batch = await Promise.all(threads.slice(i, i + 8).map(async t => {
        const cached = cache.get(t.id);
        if (cached && Date.now() - cached.at < (cached.items.length ? 10000 : 60000)) {
          return cached.items.map(item => ({ ...item, threadTitle: t.title ?? t.id }));
        }
        try {
          const version = versions.get(t.id) ?? 0;
          const items = (await bb.sdk.threads.interactions.list({ threadId: t.id }))
            .filter(x => x.status === 'pending')
            .map(x => ({ id: x.id, threadId: t.id, threadTitle: t.title ?? t.id, payload: normalizePayload(x) }));
          if ((versions.get(t.id) ?? 0) === version) cache.set(t.id, { at: Date.now(), items });
          return items;
        } catch { incomplete = true; return []; }
      }));
      interactions.push(...batch.flat());
    }
    const result = {
      version: 1,
      threads: threads.map(t => ({ id: t.id, title: t.title ?? t.id, status: t.status })),
      interactions, incomplete,
    };
    const json = JSON.stringify(result);
    if (Buffer.byteLength(json) > 2 * 1024 * 1024) {
      return c.json({ error: 'State exceeds 2 MiB; select a project in plugin settings' }, 413);
    }
    c.header('Cache-Control', 'no-store');
    return c.body(json, 200, { 'Content-Type': 'application/json' });
  }, { auth: 'token' });

  bb.http.route('POST', '/answer', async c => {
    let answeringKey: string | undefined;
    try {
      const raw = await c.req.text();
      if (raw.length > 128000) return c.json({ error: 'Request too large' }, 413);
      const body = JSON.parse(raw);
      const target = targetSchema.parse(body);
      const key = JSON.stringify([target.threadId, target.interactionId]);
      if (answering.has(key)) throw new Error('Interaction answer already in progress');
      answering.add(key);
      answeringKey = key;
      await permitted(target.threadId);
      const interaction = await bb.sdk.threads.interactions.get(target);
      const resolution = validateAnswer(interaction, body.response);
      if (isAsyncQuestion(interaction) && 'kind' in resolution && resolution.kind === 'user_answer') {
        // Plugin input requests use respond(value), not provider resolve(user_answer).
        const answers = Object.fromEntries(Object.entries(resolution.answers).map(([id, a]) => [id,
          a.freeText?.trim() ? a : { selected: a.selected }]));
        await bb.sdk.threads.interactions.respond({ ...target, value: { answers } });
      } else {
        await bb.sdk.threads.interactions.resolve({ ...target, resolution });
      }
      invalidate(target.threadId);
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message.slice(0, 500) : 'Answer rejected' }, 400);
    } finally {
      if (answeringKey) answering.delete(answeringKey);
    }
  }, { auth: 'token' });

  bb.http.route('POST', '/send', async c => {
    try {
      const raw = await c.req.text();
      if (raw.length > 128000) return c.json({ error: 'Request too large' }, 413);
      const { threadId, text } = validateMessage(JSON.parse(raw));
      await permitted(threadId);
      const result = await bb.sdk.threads.send({ threadId, input: [{ type: 'text', text, mentions: [] }], mode: 'auto' });
      return c.json({ ok: true, delivery: result.delivery });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message.slice(0, 500) : 'Message rejected' }, 400);
    }
  }, { auth: 'token' });
}

