/**
 * chat.js — Core chat loop: LLM streaming + <wrexer> command execution.
 *
 * Flow:
 *  1. User message arrives via WebSocket
 *  2. Stream LLM response to client
 *  3. After full response, detect <wrexer>...</wrexer> commands
 *  4. Execute each command via child_process, stream results to client
 *  5. If commands ran, do a follow-up LLM call with tool results
 *  6. Save to history on PVC
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { buildSystemPrompt } from './systemPrompt.js';

const execAsync = promisify(exec);
const HISTORY_FILE = '/workspace/.chat_history.jsonl';
const CMD_RE = /<wrexer>([\s\S]*?)<\/wrexer>/g;

// ── LLM provider selection ────────────────────────────────────────────────────

function getProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

async function streamOpenAI(messages, onChunk) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await client.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages,
    stream: true,
    max_tokens: 4096,
  });
  let full = '';
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

async function streamAnthropic(messages, onChunk) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const [sysMsg, ...rest] = messages;
  const stream = client.messages.stream({
    model: process.env.LLM_MODEL || 'claude-3-5-haiku-20241022',
    system: sysMsg.role === 'system' ? sysMsg.content : undefined,
    messages: sysMsg.role === 'system' ? rest : messages,
    max_tokens: 4096,
  });
  let full = '';
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      const text = chunk.delta.text || '';
      if (text) { full += text; onChunk(text); }
    }
  }
  return full;
}

async function streamGemini(messages, onChunk) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const [sysMsg, ...rest] = messages;
  const isSys = sysMsg.role === 'system';
  const systemInstruction = isSys ? sysMsg.content : undefined;

  const model = genAI.getGenerativeModel({
    model: process.env.LLM_MODEL || 'gemini-3.1-flash-lite',
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
  });

  const chatMessages = isSys ? rest : messages;
  const history = chatMessages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || ' ' }],
  }));
  const lastMsg = chatMessages[chatMessages.length - 1];

  const chat = model.startChat({ history });
  const result = await chat.sendMessageStream(lastMsg.content || ' ');

  let full = '';
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

async function callLLM(messages, onChunk) {
  const provider = getProvider();
  if (!provider) throw new Error('No LLM API key set. Add OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY in the workspace settings.');
  if (provider === 'anthropic') return streamAnthropic(messages, onChunk);
  if (provider === 'gemini') return streamGemini(messages, onChunk);
  return streamOpenAI(messages, onChunk);
}

// ── Command execution ─────────────────────────────────────────────────────────

async function runCommand(cmd) {
  const trimmed = cmd.trim();
  try {
    const { stdout, stderr } = await execAsync(trimmed, {
      cwd: '/workspace',
      timeout: 60000,
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (e) {
    return { stdout: e.stdout?.trim() || '', stderr: e.stderr?.trim() || e.message, code: e.code || 1 };
  }
}

// ── History ───────────────────────────────────────────────────────────────────

async function loadHistory() {
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

// ── Main chat handler ─────────────────────────────────────────────────────────

export async function handleChat(ws, userMessage) {
  const send = (obj) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  const history = await loadHistory();

  // Build messages
  const systemPrompt = buildSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-40), // keep last 40 turns to stay within context
    { role: 'user', content: userMessage },
  ];

  await appendHistory({ role: 'user', content: userMessage });

  // Stream LLM response
  send({ type: 'thinking' });
  let assistantReply = '';
  try {
    assistantReply = await callLLM(messages, (chunk) => {
      send({ type: 'stream', content: chunk });
    });
  } catch (e) {
    send({ type: 'error', content: e.message });
    return;
  }
  send({ type: 'stream_end' });

  // Extract and run <wrexer> commands
  const cmdMatches = [...assistantReply.matchAll(CMD_RE)];
  let toolResults = '';

  if (cmdMatches.length > 0) {
    for (const match of cmdMatches) {
      const cmd = match[1].trim();
      send({ type: 'cmd_start', command: cmd });
      const result = await runCommand(cmd);
      const output = result.stdout || result.stderr || '(no output)';
      send({ type: 'cmd_result', command: cmd, output, exitCode: result.code });
      toolResults += `\n[Tool: ${cmd}]\nExit: ${result.code}\n${output}\n`;
    }

    // Follow-up LLM call with tool results
    messages.push({ role: 'assistant', content: assistantReply });
    messages.push({ role: 'user', content: `Tool results:${toolResults}\nContinue based on these results.` });

    send({ type: 'thinking' });
    let followUp = '';
    try {
      followUp = await callLLM(messages, (chunk) => {
        send({ type: 'stream', content: chunk });
      });
    } catch (e) {
      send({ type: 'error', content: e.message });
      return;
    }
    send({ type: 'stream_end' });

    // Save combined assistant reply
    await appendHistory({ role: 'assistant', content: assistantReply + '\n' + followUp });
  } else {
    await appendHistory({ role: 'assistant', content: assistantReply });
  }

  send({ type: 'done' });
}
