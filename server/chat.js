/**
 * chat.js — Core chat loop: LLM native tool calling + command execution.
 *
 * Flow:
 *  1. User message arrives via WebSocket
 *  2. Call LLM with the execute_shell_command tool schema
 *  3. If LLM returns a tool call → execute the command, feed result back
 *  4. If LLM returns plain text → stream to client and break the loop
 *  5. Save to history on PVC
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { buildSystemPrompt } from './systemPrompt.js';

const execAsync = promisify(exec);
const HISTORY_FILE = '/workspace/.chat_history.jsonl';

// ── Tool definition (shared schema across all providers) ──────────────────────

const TOOL_NAME = 'execute_shell_command';
const TOOL_DESCRIPTION = 'Execute a shell command in the /workspace directory. Use this for ALL wrexer CLI calls, file writes, npm, docker builds, and any other shell operations.';
const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    command: {
      type: 'string',
      description: 'The exact shell command to run in /workspace.',
    },
  },
  required: ['command'],
};

// ── LLM provider selection ────────────────────────────────────────────────────

function getProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY)    return 'openai';
  if (process.env.GEMINI_API_KEY)    return 'gemini';
  return null;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(messages, onChunk) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const tools = [{
    type: 'function',
    function: {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: TOOL_SCHEMA,
    },
  }];

  // OpenAI tool calling does not support streaming when tools are active,
  // so we do a non-streaming call and fake streaming for text responses.
  const response = await client.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto',
    max_tokens: 4096,
  });

  const msg = response.choices[0].message;

  // Tool call
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const call = msg.tool_calls[0];
    const args = JSON.parse(call.function.arguments);
    return { type: 'tool', command: args.command, rawMessage: msg };
  }

  // Plain text — stream char by char for UX consistency
  const text = msg.content || '';
  for (const char of text) onChunk(char);
  return { type: 'text', content: text, rawMessage: msg };
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callAnthropic(messages, onChunk) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const [sysMsg, ...rest] = messages;
  const systemText = sysMsg.role === 'system' ? sysMsg.content : undefined;
  const chatMessages = sysMsg.role === 'system' ? rest : messages;

  const tools = [{
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    input_schema: TOOL_SCHEMA,
  }];

  // Anthropic supports streaming with tools
  const stream = client.messages.stream({
    model: process.env.LLM_MODEL || 'claude-3-5-haiku-20241022',
    system: systemText,
    messages: chatMessages,
    tools,
    max_tokens: 4096,
  });

  let fullText = '';
  let toolUse = null;

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
      toolUse = { id: chunk.content_block.id, name: chunk.content_block.name, inputRaw: '' };
    } else if (chunk.type === 'content_block_delta') {
      if (chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text || '';
        if (text) { fullText += text; onChunk(text); }
      } else if (chunk.delta?.type === 'input_json_delta' && toolUse) {
        toolUse.inputRaw += chunk.delta.partial_json || '';
      }
    }
  }

  if (toolUse) {
    const args = JSON.parse(toolUse.inputRaw);
    return { type: 'tool', command: args.command, toolUseId: toolUse.id };
  }

  return { type: 'text', content: fullText };
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(messages, onChunk) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const [sysMsg, ...rest] = messages;
  const isSys = sysMsg.role === 'system';
  const systemInstruction = isSys ? sysMsg.content : undefined;

  const tools = [{
    functionDeclarations: [{
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      parameters: TOOL_SCHEMA,
    }],
  }];

  const model = genAI.getGenerativeModel({
    model: process.env.LLM_MODEL || 'gemini-1.5-flash',
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    tools,
  });

  const chatMessages = isSys ? rest : messages;
  const history = chatMessages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: m.parts || [{ text: m.content || ' ' }],
  }));
  const lastMsg = chatMessages[chatMessages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMsg.content || ' ');
  const response = result.response;

  // Check for function call
  const functionCall = response.candidates?.[0]?.content?.parts?.find(p => p.functionCall);
  if (functionCall) {
    return { type: 'tool', command: functionCall.functionCall.args.command };
  }

  // Plain text
  const text = response.text();
  for (const char of text) onChunk(char);
  return { type: 'text', content: text };
}

// ── Unified LLM call ──────────────────────────────────────────────────────────

async function callLLM(messages, onChunk) {
  const provider = getProvider();
  if (!provider) throw new Error('No LLM API key set. Add OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in workspace settings.');
  if (provider === 'anthropic') return callAnthropic(messages, onChunk);
  if (provider === 'gemini')    return callGemini(messages, onChunk);
  return callOpenAI(messages, onChunk);
}

// ── Command execution ─────────────────────────────────────────────────────────

async function runCommand(cmd) {
  const trimmed = cmd.trim();
  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd: '/workspace',
      timeout: 120000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (e) {
    const stdout = e.stdout?.trim() || '';
    const stderr = e.stderr?.trim() || '';
    const message = (stdout === '' && stderr === '') ? `Exited with code ${e.code || 1}` : e.message;
    return { stdout, stderr: stderr || message, code: e.code || 1 };
  }
}

// ── History ───────────────────────────────────────────────────────────────────

export async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

async function appendHistory(entry) {
  try {
    await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await fs.appendFile(HISTORY_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('History write failed:', e.message);
  }
}

// ── Build provider-specific tool result message ───────────────────────────────

function buildToolResultMessages(provider, messages, result, command, toolUseId) {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n') || '(no output)';
  const toolResult = `[exit: ${result.code}]\n${output}`;

  if (provider === 'anthropic') {
    // Anthropic requires the assistant message with tool_use block, then a user message with tool_result
    messages.push({
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: TOOL_NAME, input: { command } }],
    });
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: toolResult }],
    });
  } else if (provider === 'openai') {
    // OpenAI requires: assistant message with tool_calls, then tool message
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: `call_${Date.now()}`,
        type: 'function',
        function: { name: TOOL_NAME, arguments: JSON.stringify({ command }) },
      }],
    });
    messages.push({
      role: 'tool',
      tool_call_id: `call_${Date.now()}`,
      content: toolResult,
    });
  } else {
    // Gemini: use function response part
    messages.push({
      role: 'assistant',
      parts: [{ functionCall: { name: TOOL_NAME, args: { command } } }],
    });
    messages.push({
      role: 'user',
      parts: [{ functionResponse: { name: TOOL_NAME, response: { output: toolResult } } }],
    });
  }
}

// ── Main chat handler ─────────────────────────────────────────────────────────

export async function handleChat(ws, userMessage) {
  const send = (obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  const provider = getProvider();
  const history = await loadHistory();

  const systemPrompt = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-40),
    { role: 'user', content: userMessage },
  ];

  await appendHistory({ role: 'user', content: userMessage });

  let combinedAssistantReply = '';
  let loopCount = 0;
  const MAX_LOOPS = 8;

  while (loopCount < MAX_LOOPS) {
    send({ type: 'thinking' });
    let llmResult;

    try {
      llmResult = await callLLM(messages, (chunk) => {
        send({ type: 'stream', content: chunk });
      });
    } catch (e) {
      send({ type: 'error', content: e.message });
      return;
    }

    if (llmResult.type === 'text') {
      // Plain text response — we're done
      send({ type: 'stream_end' });
      if (combinedAssistantReply) combinedAssistantReply += '\n\n';
      combinedAssistantReply += llmResult.content;
      // Push assistant text to history messages for context
      messages.push({ role: 'assistant', content: llmResult.content });
      break;
    }

    // Tool call
    send({ type: 'stream_end' });
    const { command, toolUseId } = llmResult;

    send({ type: 'cmd_start', command });
    const cmdResult = await runCommand(command);
    const outputParts = [];
    if (cmdResult.stdout) outputParts.push(cmdResult.stdout);
    if (cmdResult.stderr) outputParts.push(cmdResult.stderr);
    const output = outputParts.length > 0 ? outputParts.join('\n') : '(no output)';
    send({ type: 'cmd_result', command, output, exitCode: cmdResult.code });

    if (combinedAssistantReply) combinedAssistantReply += '\n\n';
    combinedAssistantReply += `[Ran: ${command}]\n${output}`;

    // Feed tool result back so the LLM can continue
    buildToolResultMessages(provider, messages, cmdResult, command, toolUseId);
    loopCount++;
  }

  await appendHistory({ role: 'assistant', content: combinedAssistantReply });
  send({ type: 'done' });
}
