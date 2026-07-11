import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb,
  vector,
  unique,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Embedding dimension is pinned to Gemini's text-embedding-004 output size.
// If the embedding model changes, this column (and any existing rows) must
// be migrated together — see docs/ASSUMPTIONS.md.
// ---------------------------------------------------------------------------
const EMBEDDING_DIMENSIONS = 768;

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  name: text("name"),
  email: text("email").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.key, t.scope)],
);

// sensitivity: 'normal' | 'sensitive'
// source: 'conversation' | 'document' | 'manual'
export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: text("category"),
  sensitivity: text("sensitivity").notNull().default("normal"),
  source: text("source"),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

// channel: 'web' | 'telegram'
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  title: text("title"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// role: 'user' | 'assistant' | 'tool' | 'system'
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolCallId: text("tool_call_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// permissionScope: 'READ_ONLY' | 'CREATE_ONLY' | 'EDIT' | 'DELETE' | 'SEND' | 'ADMIN'
export const toolPermissions = pgTable(
  "tool_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    permissionScope: text("permission_scope").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.toolName)],
);

// trigger: 'schedule' | 'condition'
export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  schedule: text("schedule"),
  conditions: jsonb("conditions"),
  actions: jsonb("actions").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
// deliveryChannel: 'telegram' | 'web' | 'both'
export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  recurrenceRule: text("recurrence_rule"),
  status: text("status").notNull().default("planned"),
  deliveryChannel: text("delivery_channel").notNull().default("both"),
  workflowRunId: text("workflow_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: 'planned' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'requires_confirmation'
// confirmationStatus: 'not_required' | 'pending' | 'approved' | 'rejected' | 'expired'
// channel: 'web' | 'telegram' | 'cron'
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  toolName: text("tool_name"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  riskLevel: text("risk_level"),
  status: text("status").notNull(),
  confirmationStatus: text("confirmation_status"),
  requestId: text("request_id").notNull(),
  details: jsonb("details"),
  channel: text("channel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// status: 'pending' | 'approved' | 'rejected' | 'expired'
// requestedVia: 'web' | 'telegram'
export const pendingActions = pgTable("pending_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  toolName: text("tool_name").notNull(),
  toolArgs: jsonb("tool_args").notNull(),
  riskLevel: text("risk_level").notNull(),
  status: text("status").notNull().default("pending"),
  requestedVia: text("requested_via").notNull(),
  telegramChatId: text("telegram_chat_id"),
  telegramMessageId: text("telegram_message_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// sourceChannel: 'telegram' | 'web'
// status: 'uploaded' | 'parsing' | 'parsed' | 'embedding' | 'ready' | 'failed'
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sourceChannel: text("source_channel").notNull(),
  blobUrl: text("blob_url").notNull(),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull().default("uploaded"),
  error: text("error"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(), // denormalized for fast filtered vector search + isolation
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_chunks_user_id_idx").on(t.userId),
    index("document_chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// provider: 'google_calendar' (V1)
// status: 'connected' | 'revoked' | 'error'
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessToken: text("access_token").notNull(), // AES-256-GCM encrypted, see src/lib/encryption.ts
    refreshToken: text("refresh_token"), // encrypted
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("connected"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [unique().on(t.userId, t.provider)],
);

// status: 'pending' | 'linked' | 'revoked'
export const telegramLinks = pgTable("telegram_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  telegramUsername: text("telegram_username"),
  linkCode: text("link_code"),
  linkCodeExpiresAt: timestamp("link_code_expires_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
