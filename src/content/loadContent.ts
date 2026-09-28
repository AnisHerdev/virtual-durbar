import { createContext, useContext } from 'react';
import type { CodexCard, Content, Manifest, RagaDef, RoleDef, RoleId, TacticDef, TaskDef, TasksFile } from './types';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadContent(): Promise<Content> {
  const [roles, tasks, codex, tactics, ragas, manifest] = await Promise.all([
    getJson<RoleDef[]>('/assets/content/roles.json'),
    getJson<TasksFile>('/assets/content/tasks.json'),
    getJson<CodexCard[]>('/assets/content/codex.json'),
    getJson<TacticDef[]>('/assets/content/kautilya.json'),
    getJson<RagaDef[]>('/assets/content/ragas.json'),
    getJson<Manifest>('/assets/manifest.json'),
  ]);
  validateContent({ roles, tasks, codex, tactics, ragas, manifest });
  return { roles, tasks, codex, tactics, ragas, manifest };
}

/** Catches broken cross-references early, when editing the JSON by hand. */
export function validateContent(c: Content): void {
  const taskIds = new Set(c.tasks.tasks.map((t) => t.id));
  const codexIds = new Set(c.codex.map((x) => x.id));
  const problems: string[] = [];
  let count = 0;
  for (const day of c.tasks.days) {
    for (const { taskId } of day.tasks) {
      count++;
      if (!taskIds.has(taskId)) problems.push(`day ${day.day}: unknown task ${taskId}`);
    }
  }
  if (count !== 15) problems.push(`expected 15 tasks across the 3 days, found ${count}`);
  for (const t of c.tasks.tasks) {
    if (t.codexId && !codexIds.has(t.codexId)) problems.push(`${t.id}: unknown codex ${t.codexId}`);
    if (t.kind === 'sunset') {
      for (const e of t.edicts) {
        if (e.codexId && !codexIds.has(e.codexId)) problems.push(`${t.id}/${e.id}: unknown codex ${e.codexId}`);
      }
    }
    if (t.kind === 'petition' && t.mode === 'puzzle' && t.options.filter((o) => o.correct).length !== 1) {
      problems.push(`${t.id}: puzzle petitions need exactly one correct option`);
    }
    if (t.kind === 'riddle' && !t.options.some((o) => o.id === t.answerId)) {
      problems.push(`${t.id}: answerId not among options`);
    }
  }
  if (problems.length) throw new Error(`Content errors:\n${problems.join('\n')}`);
}

export const ContentContext = createContext<Content | null>(null);

export function useContent(): Content {
  const c = useContext(ContentContext);
  if (!c) throw new Error('useContent outside ContentContext');
  return c;
}

export function taskById(content: Content, id: string): TaskDef {
  const t = content.tasks.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown task ${id}`);
  return t;
}

export function roleDef(content: Content, id: RoleId): RoleDef {
  return content.roles.find((r) => r.id === id)!;
}
