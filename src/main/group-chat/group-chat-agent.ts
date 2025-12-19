/**
 * @file group-chat-agent.ts
 * @description Participant (agent) management for Group Chat feature.
 *
 * Participants are AI agents that work together in a group chat:
 * - Each participant has a unique name within the chat
 * - Participants receive messages from the moderator
 * - Participants can collaborate by referencing the shared chat log
 */

import { v4 as uuidv4 } from 'uuid';
import {
  GroupChatParticipant,
  loadGroupChat,
  addParticipantToChat,
  removeParticipantFromChat,
  getParticipant,
} from './group-chat-storage';
import { appendToLog } from './group-chat-log';
import { IProcessManager, isModeratorActive } from './group-chat-moderator';
import type { AgentDetector } from '../agent-detector';

/**
 * In-memory store for active participant sessions.
 * Maps `${groupChatId}:${participantName}` -> sessionId
 */
const activeParticipantSessions = new Map<string, string>();

/**
 * Generate a key for the participant sessions map.
 */
function getParticipantKey(groupChatId: string, participantName: string): string {
  return `${groupChatId}:${participantName}`;
}

/**
 * Generate the system prompt for a participant.
 */
export function getParticipantSystemPrompt(
  participantName: string,
  groupChatName: string,
  logPath: string
): string {
  return `You are participating in a group chat named "${groupChatName}".

Your Role: ${participantName}

You will receive instructions from the moderator. When you complete a task or need to communicate:
1. Respond with clear, concise messages
2. Reference the chat log at "${logPath}" for context on what others have said
3. Focus on your assigned role and tasks

Be collaborative and professional. Your responses will be shared with the moderator and other participants.`;
}

/**
 * Adds a participant to a group chat and spawns their agent session.
 *
 * @param groupChatId - The ID of the group chat
 * @param name - The participant's name (must be unique within the chat)
 * @param agentId - The agent type to use (e.g., 'claude-code')
 * @param processManager - The process manager to use for spawning
 * @param cwd - Working directory for the agent (defaults to home directory)
 * @param agentDetector - Optional agent detector for resolving agent paths
 * @param customEnvVars - Optional custom environment variables for the agent
 * @returns The created participant
 */
export async function addParticipant(
  groupChatId: string,
  name: string,
  agentId: string,
  processManager: IProcessManager,
  cwd: string = process.env.HOME || '/tmp',
  agentDetector?: AgentDetector,
  customEnvVars?: Record<string, string>
): Promise<GroupChatParticipant> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  // Check if moderator is active
  if (!isModeratorActive(groupChatId)) {
    throw new Error(`Moderator must be active before adding participants to group chat: ${groupChatId}`);
  }

  // Check for duplicate name
  if (chat.participants.some(p => p.name === name)) {
    throw new Error(`Participant with name '${name}' already exists in group chat`);
  }

  // Resolve the agent configuration to get the executable command
  let command = agentId;
  let args: string[] = [];

  if (agentDetector) {
    const agent = await agentDetector.getAgent(agentId);
    if (!agent || !agent.available) {
      throw new Error(`Agent '${agentId}' is not available`);
    }
    command = agent.path || agent.command;
    args = [...agent.args];
  }

  // Generate session ID for this participant
  const sessionId = `group-chat-${groupChatId}-participant-${name}-${uuidv4()}`;

  // Generate system prompt for the participant
  const prompt = getParticipantSystemPrompt(name, chat.name, chat.logPath);

  // Spawn the participant agent
  const result = processManager.spawn({
    sessionId,
    toolType: agentId,
    cwd,
    command,
    args,
    readOnlyMode: false, // Participants can make changes
    prompt,
    customEnvVars,
  });

  if (!result.success) {
    throw new Error(`Failed to spawn participant '${name}' for group chat ${groupChatId}`);
  }

  // Create participant record
  const participant: GroupChatParticipant = {
    name,
    agentId,
    sessionId,
    addedAt: Date.now(),
  };

  // Store the session mapping
  activeParticipantSessions.set(getParticipantKey(groupChatId, name), sessionId);

  // Add participant to the group chat
  await addParticipantToChat(groupChatId, participant);

  return participant;
}

/**
 * Sends a message to a specific participant in a group chat.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant
 * @param message - The message to send
 * @param processManager - The process manager (optional)
 */
export async function sendToParticipant(
  groupChatId: string,
  participantName: string,
  message: string,
  processManager?: IProcessManager
): Promise<void> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  // Find the participant
  const participant = await getParticipant(groupChatId, participantName);
  if (!participant) {
    throw new Error(`Participant '${participantName}' not found in group chat`);
  }

  // Get the session ID
  const sessionId = activeParticipantSessions.get(getParticipantKey(groupChatId, participantName));
  if (!sessionId && processManager) {
    throw new Error(`No active session for participant '${participantName}'`);
  }

  // Log the message as coming from the moderator to this participant
  await appendToLog(chat.logPath, `moderator->${participantName}`, message);

  // Send to the participant's session if process manager is provided
  if (processManager && sessionId) {
    processManager.write(sessionId, message + '\n');
  }
}

/**
 * Removes a participant from a group chat and kills their session.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant to remove
 * @param processManager - The process manager (optional, for killing the process)
 */
export async function removeParticipant(
  groupChatId: string,
  participantName: string,
  processManager?: IProcessManager
): Promise<void> {
  const chat = await loadGroupChat(groupChatId);
  if (!chat) {
    throw new Error(`Group chat not found: ${groupChatId}`);
  }

  // Find the participant to get session info before removal
  const participant = await getParticipant(groupChatId, participantName);
  if (!participant) {
    throw new Error(`Participant '${participantName}' not found in group chat`);
  }

  // Get the session ID from our active sessions map
  const key = getParticipantKey(groupChatId, participantName);
  const sessionId = activeParticipantSessions.get(key);

  // Kill the session if process manager provided and session exists
  if (processManager && sessionId) {
    processManager.kill(sessionId);
  }

  // Remove from active sessions
  activeParticipantSessions.delete(key);

  // Remove from group chat
  await removeParticipantFromChat(groupChatId, participantName);
}

/**
 * Gets the session ID for a participant.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant
 * @returns The session ID, or undefined if not active
 */
export function getParticipantSessionId(
  groupChatId: string,
  participantName: string
): string | undefined {
  return activeParticipantSessions.get(getParticipantKey(groupChatId, participantName));
}

/**
 * Checks if a participant is currently active.
 *
 * @param groupChatId - The ID of the group chat
 * @param participantName - The name of the participant
 * @returns True if the participant is active
 */
export function isParticipantActive(
  groupChatId: string,
  participantName: string
): boolean {
  return activeParticipantSessions.has(getParticipantKey(groupChatId, participantName));
}

/**
 * Gets all active participants for a group chat.
 *
 * @param groupChatId - The ID of the group chat
 * @returns Array of participant names that are currently active
 */
export function getActiveParticipants(groupChatId: string): string[] {
  const prefix = `${groupChatId}:`;
  const participants: string[] = [];

  for (const key of activeParticipantSessions.keys()) {
    if (key.startsWith(prefix)) {
      participants.push(key.slice(prefix.length));
    }
  }

  return participants;
}

/**
 * Clears all active participant sessions for a group chat.
 *
 * @param groupChatId - The ID of the group chat
 * @param processManager - The process manager (optional, for killing processes)
 */
export async function clearAllParticipantSessions(
  groupChatId: string,
  processManager?: IProcessManager
): Promise<void> {
  const prefix = `${groupChatId}:`;
  const keysToDelete: string[] = [];

  for (const [key, sessionId] of activeParticipantSessions.entries()) {
    if (key.startsWith(prefix)) {
      if (processManager) {
        processManager.kill(sessionId);
      }
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    activeParticipantSessions.delete(key);
  }
}

/**
 * Clears ALL active participant sessions (all group chats).
 * Useful for cleanup during shutdown or testing.
 */
export function clearAllParticipantSessionsGlobal(): void {
  activeParticipantSessions.clear();
}
