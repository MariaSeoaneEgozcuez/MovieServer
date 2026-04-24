// Shared message schemas and utilities for microservices
import { v4 as uuidv4 } from 'uuid';

export const MESSAGE_TYPES = {
  // Auth
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_VERIFY: 'auth.verify',
  AUTH_LOGOUT: 'auth.logout',

  // Database
  DB_USER_GET: 'db.user.get',
  DB_USER_CREATE: 'db.user.create',
  DB_USER_UPDATE: 'db.user.update',
  DB_TOKEN_REVOKE: 'db.token.revoke',
  DB_TOKEN_CHECK: 'db.token.check',
  DB_STATS: 'db.stats',

  // LLM
  LLM_REQUEST: 'llm.request',
  LLM_RESPONSE: 'llm.response',

  // Telegram
  TELEGRAM_MESSAGE: 'telegram.message',
  TELEGRAM_COMMAND: 'telegram.command',

  // General
  HEALTH_CHECK: 'health.check',
  ERROR: 'error'
};

export function createMessage(type, payload, correlationId = null, replyTo = null) {
  return {
    messageId: uuidv4(),
    timestamp: new Date().toISOString(),
    type,
    correlationId: correlationId || uuidv4(),
    replyTo,
    payload,
    metadata: {
      source: process.env.SERVICE_NAME || 'unknown',
      priority: 'normal'
    }
  };
}

export function createReply(originalMessage, payload) {
  return createMessage(
    originalMessage.type + '.reply',
    payload,
    originalMessage.correlationId,
    originalMessage.replyTo
  );
}

export function createErrorReply(originalMessage, error) {
  return createMessage(
    MESSAGE_TYPES.ERROR,
    { error: error.message || error },
    originalMessage.correlationId,
    originalMessage.replyTo
  );
}