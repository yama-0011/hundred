export interface AIDesktopProjectsEnv {
  DB: D1Database;
}

const validServiceId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value);
const projectStatuses = new Set(['planning', 'proposal', 'design', 'development', 'review', 'completed', 'on-hold']);
const developmentModes = new Set(['personal', 'team']);
const documentPhases = new Set(['common', 'planning', 'requirements', 'basic-design', 'detailed-design', 'implementation', 'test', 'release', 'operation', 'research']);
const documentTypes = new Set(['external-design', 'internal-design', 'ui-design', 'database-design', 'api-design', 'usage-guide', 'procedure', 'research', 'test-specification', 'minutes', 'other']);

type ProjectDocument = {
  serviceId: string;
  categoryId: string;
  contentId: string;
  title: string;
  phase: string;
  documentType: string;
  note: string;
  sortOrder: number;
};

type ProjectDetail = {
  name: string;
  description: string;
  category?: string;
  ddl?: string;
};

type ProjectEnvironment = {
  summary: { os: string; runtime: string; packageManager: string; frontend: string; worker: string };
  prerequisites: Array<{ name: string; version: string; required: boolean; description: string }>;
  services: Array<{ name: string; endpoint: string; command: string }>;
  steps: Array<{ title: string; description: string; command: string }>;
  variables: Array<{ name: string; location: string; required: boolean; description: string }>;
  checks: Array<{ label: string }>;
};

type ProjectCommand = ProjectDetail & {
  directory: string;
  command: string;
  environment: string;
  category?: string;
  pinned?: boolean;
};

type ProjectLink = ProjectDetail & {
  type: string;
  url: string;
};

type ProjectRule = ProjectDetail & {
  importance: 'required' | 'recommended';
};

export type AIDesktopProjectActor = {
  ownerUserId: string;
  username: string;
};

type ProjectMember = {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
};

type ProjectInput = {
  name: string;
  customerName: string;
  summary: string;
  objective: string;
  status: string;
  developmentMode: string;
  systemDiagramSource: string;
  fileStructure: string;
  technologyStack: ProjectDetail[];
  databaseInfo: ProjectDetail[];
  environmentSetup: ProjectEnvironment;
  commands: ProjectCommand[];
  links: ProjectLink[];
  projectRules: ProjectRule[];
  designNotes: string;
  developmentNotes: string;
  relatedDocuments: ProjectDocument[];
  memberUserIds: string[] | null;
};

type ProjectRow = {
  project_id: string;
  name: string;
  customer_name: string;
  summary: string;
  objective: string;
  status: string;
  development_mode: string;
  system_diagram_source: string;
  file_structure: string;
  technology_stack_json: string;
  database_info_json: string;
  environment_setup_json: string;
  tools_json: string;
  commands_json: string;
  links_json: string;
  project_rules_json: string;
  design_notes: string;
  development_notes: string;
  related_documents_json: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
};

export class AIDesktopProjectError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN') {
    super(code);
    this.name = 'AIDesktopProjectError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.length <= max;
}

function validateDocuments(value: unknown): ProjectDocument[] {
  if (!Array.isArray(value) || value.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
  const documents = value.map((document, index) => {
    if (!isRecord(document) || !validServiceId(document.serviceId) || !requiredText(document.categoryId, 300) || !requiredText(document.contentId, 300) || !requiredText(document.title, 200) || (document.phase !== undefined && !documentPhases.has(String(document.phase))) || (document.documentType !== undefined && !documentTypes.has(String(document.documentType))) || (document.note !== undefined && !text(document.note, 1_000)) || (document.sortOrder !== undefined && (typeof document.sortOrder !== 'number' || !Number.isInteger(document.sortOrder) || document.sortOrder < 0 || document.sortOrder > 10_000))) throw new AIDesktopProjectError('INVALID_INPUT');
    return { serviceId: String(document.serviceId), categoryId: String(document.categoryId), contentId: String(document.contentId), title: String(document.title), phase: document.phase === undefined ? 'common' : String(document.phase), documentType: document.documentType === undefined ? 'other' : String(document.documentType), note: document.note === undefined ? '' : String(document.note), sortOrder: document.sortOrder === undefined ? index : Number(document.sortOrder) };
  });
  const keys = documents.map((document) => `${document.serviceId}:${document.categoryId}:${document.contentId}`);
  if (new Set(keys).size !== keys.length) throw new AIDesktopProjectError('INVALID_INPUT');
  return documents;
}

function validateMemberUserIds(value: unknown): string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 100 || !value.every((item) => requiredText(item, 128))) throw new AIDesktopProjectError('INVALID_INPUT');
  return [...new Set(value.map((item) => String(item).trim()))];
}

function legacyProjectDetail(value: string): ProjectDetail {
  const delimiter = ' — ';
  const index = value.indexOf(delimiter);
  return index < 0
    ? { name: value.trim(), description: '', category: '', ddl: '' }
    : { name: value.slice(0, index).trim(), description: value.slice(index + delimiter.length).trim(), category: '', ddl: '' };
}

function validateProjectDetails(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new AIDesktopProjectError('INVALID_INPUT');
  const items = value.map((item) => {
    if (typeof item === 'string') {
      if (!item.trim() || item.length > 1_200) throw new AIDesktopProjectError('INVALID_INPUT');
      const detail = legacyProjectDetail(item);
      if (!requiredText(detail.name, 200) || !text(detail.description, 1_000)) throw new AIDesktopProjectError('INVALID_INPUT');
      return detail;
    }
    if (!isRecord(item) || !requiredText(item.name, 200) || !text(item.description, 1_000) || (item.category !== undefined && !text(item.category, 100)) || (item.ddl !== undefined && !text(item.ddl, 50_000))) throw new AIDesktopProjectError('INVALID_INPUT');
    return { name: String(item.name).trim(), description: String(item.description).trim(), category: item.category === undefined ? '' : String(item.category).trim(), ddl: item.ddl === undefined ? '' : String(item.ddl).trim() };
  });
  return items;
}

function parseProjectDetails(value: string, maxItems: number) {
  try { return validateProjectDetails(JSON.parse(value), maxItems); } catch { return []; }
}

const blankProjectEnvironment = (): ProjectEnvironment => ({
  summary: { os: '', runtime: '', packageManager: '', frontend: '', worker: '' },
  prerequisites: [], services: [], steps: [], variables: [], checks: [],
});

function validateProjectEnvironment(value: unknown): ProjectEnvironment {
  if (Array.isArray(value)) {
    const legacy = validateProjectDetails(value, 100);
    return { ...blankProjectEnvironment(), prerequisites: legacy.map((item) => ({ name: item.name, version: '', required: true, description: item.description })) };
  }
  if (!isRecord(value) || !isRecord(value.summary)) throw new AIDesktopProjectError('INVALID_INPUT');
  const summary = value.summary as Record<string, unknown>;
  const summaryKeys = ['os', 'runtime', 'packageManager', 'frontend', 'worker'] as const;
  if (!summaryKeys.every((key) => text(summary[key], 200))) throw new AIDesktopProjectError('INVALID_INPUT');
  const readList = <T>(key: string, validator: (item: Record<string, unknown>) => T): T[] => {
    const list = value[key];
    if (!Array.isArray(list) || list.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
    return list.map((item) => { if (!isRecord(item)) throw new AIDesktopProjectError('INVALID_INPUT'); return validator(item); });
  };
  return {
    summary: Object.fromEntries(summaryKeys.map((key) => [key, String(summary[key]).trim()])) as ProjectEnvironment['summary'],
    prerequisites: readList('prerequisites', (item) => {
      if (!requiredText(item.name, 200) || !text(item.version, 100) || typeof item.required !== 'boolean' || !text(item.description, 1_000)) throw new AIDesktopProjectError('INVALID_INPUT');
      return { name: String(item.name).trim(), version: String(item.version).trim(), required: item.required, description: String(item.description).trim() };
    }),
    services: readList('services', (item) => {
      if (!requiredText(item.name, 200) || !text(item.endpoint, 500) || !text(item.command, 4_000)) throw new AIDesktopProjectError('INVALID_INPUT');
      return { name: String(item.name).trim(), endpoint: String(item.endpoint).trim(), command: String(item.command).trim() };
    }),
    steps: readList('steps', (item) => {
      if (!requiredText(item.title, 200) || !text(item.description, 1_000) || !text(item.command, 4_000)) throw new AIDesktopProjectError('INVALID_INPUT');
      return { title: String(item.title).trim(), description: String(item.description).trim(), command: String(item.command).trim() };
    }),
    variables: readList('variables', (item) => {
      if (!requiredText(item.name, 200) || !text(item.location, 200) || typeof item.required !== 'boolean' || !text(item.description, 1_000)) throw new AIDesktopProjectError('INVALID_INPUT');
      return { name: String(item.name).trim(), location: String(item.location).trim(), required: item.required, description: String(item.description).trim() };
    }),
    checks: readList('checks', (item) => {
      if (!requiredText(item.label, 500)) throw new AIDesktopProjectError('INVALID_INPUT');
      return { label: String(item.label).trim() };
    }),
  };
}

function parseProjectEnvironment(value: string) {
  try { return validateProjectEnvironment(JSON.parse(value)); } catch { return blankProjectEnvironment(); }
}

function validateProjectCommands(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
  return value.map((item) => {
    if (!isRecord(item) || !requiredText(item.name, 200) || !text(item.description, 1_000) || !text(item.directory, 500) || !requiredText(item.command, 4_000) || !text(item.environment, 100) || (item.category !== undefined && !text(item.category, 100)) || (item.pinned !== undefined && typeof item.pinned !== 'boolean')) throw new AIDesktopProjectError('INVALID_INPUT');
    return { name: String(item.name).trim(), description: String(item.description).trim(), directory: String(item.directory).trim(), command: String(item.command).trim(), environment: String(item.environment).trim(), category: item.category === undefined ? '' : String(item.category).trim(), pinned: item.pinned === true };
  });
}

function parseProjectCommands(value: string) {
  try { return validateProjectCommands(JSON.parse(value)); } catch { return []; }
}

function validateProjectLinks(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
  return value.map((item) => {
    if (!isRecord(item) || !requiredText(item.name, 200) || !text(item.description, 1_000) || !text(item.type, 100) || !requiredText(item.url, 2_000)) throw new AIDesktopProjectError('INVALID_INPUT');
    const url = String(item.url).trim();
    if (!/^https?:\/\//u.test(url)) throw new AIDesktopProjectError('INVALID_INPUT');
    return { name: String(item.name).trim(), description: String(item.description).trim(), type: String(item.type).trim(), url };
  });
}

function parseProjectLinks(value: string) {
  try { return validateProjectLinks(JSON.parse(value)); } catch { return []; }
}

function validateProjectRules(value: unknown): ProjectRule[] {
  if (!Array.isArray(value) || value.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
  return value.map((item) => {
    const detail = validateProjectDetails([item], 1)[0];
    const importance = isRecord(item) && item.importance !== undefined ? String(item.importance) : 'recommended';
    if (importance !== 'required' && importance !== 'recommended') throw new AIDesktopProjectError('INVALID_INPUT');
    return { ...detail, importance };
  });
}

function parseProjectRules(value: string) {
  try { return validateProjectRules(JSON.parse(value)); } catch { return []; }
}

function validateProjectInput(value: unknown): ProjectInput {
  if (!isRecord(value) || !requiredText(value.name, 120) || !text(value.customerName, 120) || !text(value.summary, 2_000) || !text(value.objective, 5_000) || !projectStatuses.has(String(value.status)) || !developmentModes.has(String(value.developmentMode)) || !text(value.systemDiagramSource, 50_000) || (value.fileStructure !== undefined && !text(value.fileStructure, 50_000)) || !text(value.designNotes, 50_000) || !text(value.developmentNotes, 50_000)) throw new AIDesktopProjectError('INVALID_INPUT');
  return {
    name: String(value.name).trim(),
    customerName: String(value.customerName).trim(),
    summary: String(value.summary),
    objective: String(value.objective),
    status: String(value.status),
    developmentMode: String(value.developmentMode),
    systemDiagramSource: String(value.systemDiagramSource),
    fileStructure: value.fileStructure === undefined ? '' : String(value.fileStructure),
    technologyStack: validateProjectDetails(value.technologyStack, 100),
    databaseInfo: validateProjectDetails(value.databaseInfo, 100),
    environmentSetup: value.environmentSetup === undefined ? blankProjectEnvironment() : validateProjectEnvironment(value.environmentSetup),
    commands: value.commands === undefined ? [] : validateProjectCommands(value.commands),
    links: value.links === undefined ? [] : validateProjectLinks(value.links),
    projectRules: value.projectRules === undefined ? [] : validateProjectRules(value.projectRules),
    designNotes: String(value.designNotes),
    developmentNotes: String(value.developmentNotes),
    relatedDocuments: validateDocuments(value.relatedDocuments),
    memberUserIds: validateMemberUserIds(value.memberUserIds),
  };
}

function projectFromRow(row: ProjectRow, members: ProjectMember[], canEdit: boolean) {
  let relatedDocuments: ProjectDocument[] = [];
  try { relatedDocuments = validateDocuments(JSON.parse(row.related_documents_json)); } catch { relatedDocuments = []; }
  return {
    id: row.project_id,
    name: row.name,
    customerName: row.customer_name,
    summary: row.summary,
    objective: row.objective,
    status: row.status,
    developmentMode: developmentModes.has(row.development_mode) ? row.development_mode : 'personal',
    systemDiagramSource: row.system_diagram_source,
    fileStructure: row.file_structure,
    technologyStack: parseProjectDetails(row.technology_stack_json, 100),
    databaseInfo: parseProjectDetails(row.database_info_json, 100),
    environmentSetup: parseProjectEnvironment(row.environment_setup_json),
    commands: parseProjectCommands(row.commands_json),
    links: parseProjectLinks(row.links_json),
    projectRules: parseProjectRules(row.project_rules_json),
    designNotes: row.design_notes,
    developmentNotes: row.development_notes,
    relatedDocuments,
    members,
    memberUserIds: members.filter((member) => member.role === 'member').map((member) => member.userId),
    canEdit,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function syncProjectActor(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (owner_user_id) VALUES (?) ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = unixepoch()`).bind(actor.ownerUserId),
    env.DB.prepare(`INSERT INTO hundred_user_directory (user_id, username, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, last_seen_at = excluded.last_seen_at`).bind(actor.ownerUserId, actor.username, now),
    env.DB.prepare(`INSERT INTO ai_desktop_project_members (project_id, user_id, role, added_by, added_at) SELECT project_id, ?, 'owner', ?, ? FROM ai_desktop_projects WHERE created_by = ? ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'`).bind(actor.ownerUserId, actor.username, now, actor.username),
  ]);
}

async function listProjectMembers(env: AIDesktopProjectsEnv, projectId: string): Promise<ProjectMember[]> {
  const result = await env.DB.prepare(`SELECT member.user_id, COALESCE(NULLIF(directory.display_name, ''), directory.username, member.user_id) AS display_name, member.role FROM ai_desktop_project_members member LEFT JOIN hundred_user_directory directory ON directory.user_id = member.user_id WHERE member.project_id = ? ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END, display_name COLLATE NOCASE`).bind(projectId).all<{ user_id: string; display_name: string; role: 'owner' | 'member' }>();
  return result.results.map((member) => ({ userId: member.user_id, displayName: member.display_name, role: member.role }));
}

async function validateKnownMembers(env: AIDesktopProjectsEnv, memberUserIds: string[], ownerUserId: string) {
  const ids = memberUserIds.filter((userId) => userId !== ownerUserId);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const result = await env.DB.prepare(`SELECT user_id FROM hundred_user_directory WHERE user_id IN (${placeholders})`).bind(...ids).all<{ user_id: string }>();
  if (result.results.length !== ids.length) throw new AIDesktopProjectError('INVALID_INPUT');
  return ids;
}

async function validatePublishedProjectDocuments(env: AIDesktopProjectsEnv, documents: ProjectDocument[]) {
  const serviceIds = [...new Set(documents.map((document) => document.serviceId))];
  const statuses = await Promise.all(serviceIds.map((serviceId) => env.DB.prepare('SELECT status FROM ai_desktop_catalog_metadata WHERE service_id = ?').bind(serviceId).first<{ status: string }>()));
  if (statuses.some((row) => row && row.status !== 'published')) throw new AIDesktopProjectError('INVALID_INPUT');
}

async function editableProject(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  await syncProjectActor(env, actor);
  const row = await env.DB.prepare(`SELECT project_id FROM ai_desktop_projects project WHERE project_id = ? AND (created_by = ? OR EXISTS (SELECT 1 FROM ai_desktop_project_members member WHERE member.project_id = project.project_id AND member.user_id = ? AND member.role = 'owner'))`).bind(projectId, actor.username, actor.ownerUserId).first<{ project_id: string }>();
  if (!row) {
    const exists = await env.DB.prepare('SELECT project_id FROM ai_desktop_projects WHERE project_id = ?').bind(projectId).first();
    throw new AIDesktopProjectError(exists ? 'FORBIDDEN' : 'NOT_FOUND');
  }
}

export async function searchAIDesktopUsers(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, query: string) {
  await syncProjectActor(env, actor);
  const normalized = query.trim();
  if (normalized.length > 100) throw new AIDesktopProjectError('INVALID_INPUT');
  const result = await env.DB.prepare(`SELECT user_id, COALESCE(NULLIF(display_name, ''), username) AS display_name FROM hundred_user_directory WHERE ? = '' OR display_name LIKE ? COLLATE NOCASE OR username LIKE ? COLLATE NOCASE ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, display_name COLLATE NOCASE, username COLLATE NOCASE LIMIT 30`).bind(normalized, `%${normalized}%`, `%${normalized}%`, actor.ownerUserId).all<{ user_id: string; display_name: string }>();
  return { users: result.results.map((user) => ({ userId: user.user_id, displayName: user.display_name, isCurrentUser: user.user_id === actor.ownerUserId })) };
}

export async function saveAIDesktopUserProfile(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  const value: unknown = await request.json();
  if (!isRecord(value) || !requiredText(value.displayName, 120)) throw new AIDesktopProjectError('INVALID_INPUT');
  const displayName = String(value.displayName).trim();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (owner_user_id) VALUES (?) ON CONFLICT(owner_user_id) DO UPDATE SET updated_at = unixepoch()`).bind(actor.ownerUserId),
    env.DB.prepare(`INSERT INTO hundred_user_directory (user_id, username, display_name, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, last_seen_at = excluded.last_seen_at`).bind(actor.ownerUserId, actor.username, displayName, now),
  ]);
  return { user: { userId: actor.ownerUserId, displayName } };
}

export async function listAIDesktopProjects(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  await syncProjectActor(env, actor);
  const result = await env.DB.prepare(`SELECT project_id, name, customer_name, summary, status, development_mode, updated_by, created_at, updated_at, CASE WHEN created_by = ? OR EXISTS (SELECT 1 FROM ai_desktop_project_members owner_member WHERE owner_member.project_id = project.project_id AND owner_member.user_id = ? AND owner_member.role = 'owner') THEN 1 ELSE 0 END AS can_edit FROM ai_desktop_projects project WHERE created_by = ? OR EXISTS (SELECT 1 FROM ai_desktop_project_members member WHERE member.project_id = project.project_id AND member.user_id = ?) ORDER BY updated_at DESC LIMIT 200`).bind(actor.username, actor.ownerUserId, actor.username, actor.ownerUserId).all<{ project_id: string; name: string; customer_name: string; summary: string; status: string; development_mode: string; updated_by: string; created_at: number; updated_at: number; can_edit: number }>();
  return { projects: result.results.map((row) => ({ id: row.project_id, name: row.name, customerName: row.customer_name, summary: row.summary, status: row.status, developmentMode: developmentModes.has(row.development_mode) ? row.development_mode : 'personal', canEdit: Boolean(row.can_edit), updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at })) };
}

export async function getAIDesktopProject(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  await syncProjectActor(env, actor);
  const row = await env.DB.prepare(`SELECT * FROM ai_desktop_projects project WHERE project_id = ? AND (created_by = ? OR EXISTS (SELECT 1 FROM ai_desktop_project_members member WHERE member.project_id = project.project_id AND member.user_id = ?))`).bind(projectId, actor.username, actor.ownerUserId).first<ProjectRow>();
  if (!row) throw new AIDesktopProjectError('NOT_FOUND');
  const members = await listProjectMembers(env, projectId);
  const canEdit = row.created_by === actor.username || members.some((member) => member.userId === actor.ownerUserId && member.role === 'owner');
  return { project: projectFromRow(row, members, canEdit) };
}

export async function createAIDesktopProject(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor) {
  await syncProjectActor(env, actor);
  const project = validateProjectInput(await request.json());
  await validatePublishedProjectDocuments(env, project.relatedDocuments);
  const memberUserIds = await validateKnownMembers(env, project.memberUserIds ?? [], actor.ownerUserId);
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ai_desktop_projects (project_id, name, customer_name, summary, objective, status, development_mode, system_diagram_source, file_structure, technology_stack_json, database_info_json, environment_setup_json, tools_json, commands_json, links_json, project_rules_json, design_notes, development_notes, related_documents_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, project.name, project.customerName, project.summary, project.objective, project.status, project.developmentMode, project.systemDiagramSource, project.fileStructure, JSON.stringify(project.technologyStack), JSON.stringify(project.databaseInfo), JSON.stringify(project.environmentSetup), '[]', JSON.stringify(project.commands), JSON.stringify(project.links), JSON.stringify(project.projectRules), project.designNotes, project.developmentNotes, JSON.stringify(project.relatedDocuments), actor.username, actor.username, now, now),
    env.DB.prepare(`INSERT INTO ai_desktop_project_members (project_id, user_id, role, added_by, added_at) VALUES (?, ?, 'owner', ?, ?)`).bind(id, actor.ownerUserId, actor.username, now),
    ...memberUserIds.map((userId) => env.DB.prepare(`INSERT INTO ai_desktop_project_members (project_id, user_id, role, added_by, added_at) VALUES (?, ?, 'member', ?, ?)`).bind(id, userId, actor.username, now)),
  ]);
  return getAIDesktopProject(env, actor, id);
}

export async function updateAIDesktopProject(request: Request, env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  await editableProject(env, actor, projectId);
  const project = validateProjectInput(await request.json());
  const current = await env.DB.prepare('SELECT related_documents_json FROM ai_desktop_projects WHERE project_id = ?').bind(projectId).first<{ related_documents_json: string }>();
  let currentDocuments: ProjectDocument[] = [];
  try { currentDocuments = validateDocuments(JSON.parse(current?.related_documents_json ?? '[]')); } catch { currentDocuments = []; }
  const currentDocumentKeys = new Set(currentDocuments.map((document) => `${document.serviceId}:${document.categoryId}:${document.contentId}`));
  await validatePublishedProjectDocuments(env, project.relatedDocuments.filter((document) => !currentDocumentKeys.has(`${document.serviceId}:${document.categoryId}:${document.contentId}`)));
  const memberUserIds = project.memberUserIds === null ? null : await validateKnownMembers(env, project.memberUserIds, actor.ownerUserId);
  const now = Date.now();
  const statements = [env.DB.prepare('UPDATE ai_desktop_projects SET name = ?, customer_name = ?, summary = ?, objective = ?, status = ?, development_mode = ?, system_diagram_source = ?, file_structure = ?, technology_stack_json = ?, database_info_json = ?, environment_setup_json = ?, tools_json = ?, commands_json = ?, links_json = ?, project_rules_json = ?, design_notes = ?, development_notes = ?, related_documents_json = ?, updated_by = ?, updated_at = ? WHERE project_id = ?').bind(project.name, project.customerName, project.summary, project.objective, project.status, project.developmentMode, project.systemDiagramSource, project.fileStructure, JSON.stringify(project.technologyStack), JSON.stringify(project.databaseInfo), JSON.stringify(project.environmentSetup), '[]', JSON.stringify(project.commands), JSON.stringify(project.links), JSON.stringify(project.projectRules), project.designNotes, project.developmentNotes, JSON.stringify(project.relatedDocuments), actor.username, now, projectId)];
  if (memberUserIds !== null) {
    statements.push(env.DB.prepare(`DELETE FROM ai_desktop_project_members WHERE project_id = ? AND role = 'member'`).bind(projectId));
    statements.push(...memberUserIds.map((userId) => env.DB.prepare(`INSERT INTO ai_desktop_project_members (project_id, user_id, role, added_by, added_at) VALUES (?, ?, 'member', ?, ?)`).bind(projectId, userId, actor.username, now)));
  }
  const [result] = await env.DB.batch(statements);
  if (!result.meta.changes) throw new AIDesktopProjectError('NOT_FOUND');
  return getAIDesktopProject(env, actor, projectId);
}

export async function deleteAIDesktopProject(env: AIDesktopProjectsEnv, actor: AIDesktopProjectActor, projectId: string) {
  await editableProject(env, actor, projectId);
  const result = await env.DB.prepare('DELETE FROM ai_desktop_projects WHERE project_id = ?').bind(projectId).run();
  if (!result.meta.changes) throw new AIDesktopProjectError('NOT_FOUND');
  return { deleted: true, projectId };
}
