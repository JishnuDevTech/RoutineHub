// ============================================================
//  ai.js — AI Assistant powered by Claude (Anthropic API)
//  Multilingual, handles spelling mistakes, context-aware
//  Uses the user's real data from APP state for smart responses
// ============================================================

const AI = {
    messages:    [],   // conversation history
    isTyping:    false,
    initialized: false,
  };
  
  // ============================================================
  //  INIT — called when AI section becomes visible
  // ============================================================
  
  function initAI() {
    if (AI.initialized) return;
    AI.initialized = true;
    bindAIInputEvents();
  }
  
  function bindAIInputEvents() {
    const input = document.getElementById('ai-input');
    if (!input) return;
  
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage();
      }
    });
  
    // Auto-grow textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }
  
  // ============================================================
  //  SEND MESSAGE (user → AI)
  // ============================================================
  
  async function sendAIMessage() {
    const input   = document.getElementById('ai-input');
    const message = input?.value.trim();
    if (!message || AI.isTyping) return;
  
    // Clear input
    input.value = '';
    input.style.height = 'auto';
  
    // Hide welcome screen, show messages
    const welcome = document.querySelector('.ai-welcome');
    if (welcome) welcome.style.display = 'none';
  
    // Add user message
    appendAIMessage('user', message);
    AI.messages.push({ role: 'user', content: message });
  
    // Show typing indicator
    const typingId = showAITyping();
    AI.isTyping    = true;
  
    try {
      const reply = await callClaudeAPI(message);
      hideAITyping(typingId);
      AI.isTyping = false;
      appendAIMessage('bot', reply);
      AI.messages.push({ role: 'assistant', content: reply });
  
      // Execute any actions the AI suggests
      await executeAIActions(message, reply);
  
    } catch (err) {
      hideAITyping(typingId);
      AI.isTyping = false;
      console.error('AI error:', err);
      appendAIMessage('bot', '⚠️ Sorry, I had trouble responding. Please check your API key in ai.js and try again. Make sure your Anthropic API key is set correctly.');
    }
  }
  
  function sendAIQuick(text) {
    const input = document.getElementById('ai-input');
    if (input) { input.value = text; sendAIMessage(); }
  }
  
  // ============================================================
  //  CLAUDE API CALL
  //  IMPORTANT: Replace 'YOUR_ANTHROPIC_API_KEY' with a real key
  //  Get one at: https://console.anthropic.com
  //  NOTE: For production, proxy this through your backend to
  //  avoid exposing the API key on the client side.
  // ============================================================
  
  const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
  
  async function callClaudeAPI(userMessage) {
    // Build rich system prompt with user's real data
    const systemPrompt = buildSystemPrompt();
  
    // Build conversation history (last 10 messages to stay within context)
    const history = AI.messages.slice(-10).map(m => ({
      role:    m.role === 'bot' ? 'assistant' : 'user',
      content: m.content,
    }));
  
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   [...history, { role: 'user', content: userMessage }],
      }),
    });
  
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }
  
    const data = await response.json();
    return data.content?.[0]?.text || 'No response received.';
  }
  
  // ============================================================
  //  SYSTEM PROMPT — gives Claude full context of user's data
  // ============================================================
  
  function buildSystemPrompt() {
    const user     = APP.user;
    const profile  = APP.profile;
    const name     = profile?.firstName || user?.displayName || 'the user';
  
    // Summarize current data
    const tasksSummary = APP.tasks.length
      ? APP.tasks.slice(0, 20).map(t => `- [${t.done ? 'DONE' : 'TODO'}] ${t.name} (priority: ${t.priority}, category: ${t.category}${t.date ? ', due: ' + t.date : ''})`).join('\n')
      : 'No tasks added yet.';
  
    const habitsSummary = APP.habits.length
      ? APP.habits.map(h => `- ${h.emoji} ${h.name} (streak: ${h.streak} days, completed days this week: ${(h.completedDays || []).length}/7)`).join('\n')
      : 'No habits tracked yet.';
  
    const scheduleSummary = APP.schedule.length
      ? APP.schedule.slice(0, 15).map(s => `- ${s.start}${s.end ? '-' + s.end : ''}: ${s.name}`).join('\n')
      : 'No schedule blocks added yet.';
  
    const prioritiesSummary = APP.priorities.length
      ? APP.priorities.map((p, i) => `${i + 1}. [${p.done ? 'DONE' : 'TODO'}] ${p.text}`).join('\n')
      : 'No priorities set yet.';
  
    const remindersSummary = APP.reminders.length
      ? APP.reminders.map(r => `- ${r.time}: ${r.text}`).join('\n')
      : 'No reminders set yet.';
  
    const notesSummary = APP.notes.length
      ? APP.notes.slice(0, 5).map(n => `- "${n.title || 'Untitled'}"`).join('\n')
      : 'No notes added yet.';
  
    const todayIdx = new Date().getDay();
    const todayDone = APP.habits.filter(h => (h.completedDays || []).includes(todayIdx)).length;
    const tasksDone = APP.tasks.filter(t => t.done).length;
    const tasksTotal = APP.tasks.length;
  
    return `You are the AI Assistant inside RoutineHub, a smart daily productivity app. You are helping ${name} manage their daily routine, tasks, habits, schedule, and life.
  
  TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
  TIME: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
  
  USER'S CURRENT DATA IN THE APP:
  
  📋 TASKS (${tasksTotal} total, ${tasksDone} done):
  ${tasksSummary}
  
  ⭐ PRIORITIES:
  ${prioritiesSummary}
  
  💪 HABITS:
  ${habitsSummary}
  Habits done today: ${todayDone}/${APP.habits.length}
  
  🕐 SCHEDULE:
  ${scheduleSummary}
  
  🔔 REMINDERS:
  ${remindersSummary}
  
  📝 NOTES:
  ${notesSummary}
  
  YOUR CAPABILITIES:
  You can:
  1. Analyze the user's current tasks, habits, and schedule and give smart advice
  2. Suggest how to reorganize, prioritize, or optimize their routine
  3. Create a suggested daily schedule based on their data
  4. Motivate and coach them toward their goals
  5. Give productivity tips, time management advice, and habit-building strategies
  6. Help them understand their progress and areas for improvement
  7. Answer questions in ANY language the user writes in
  8. Understand spelling mistakes and informal language naturally
  9. Suggest specific actions like "add this task", "schedule this time", "track this habit"
  
  PERSONALITY:
  - Friendly, warm, encouraging, and practical
  - Concise but thorough — don't be too wordy
  - Use emojis occasionally to make responses feel friendly (not excessive)
  - Understand typos, misspellings, and casual language naturally
  - Respond in the SAME LANGUAGE the user writes in (Hindi, Spanish, French, Arabic, etc.)
  - If the user writes in Hinglish (Hindi + English mix), respond naturally in Hinglish too
  
  IMPORTANT:
  - Base your advice on the user's ACTUAL data shown above
  - When suggesting tasks or schedules, make them specific and actionable
  - If the user asks you to "add", "create", or "set" something, tell them the exact steps or say you're doing it
  - Be their productivity coach, not just a chatbot
  - If they ask something unrelated to productivity, gently redirect`;
  }
  
  // ============================================================
  //  ACTION EXECUTION — parse AI responses for actions
  // ============================================================
  
  async function executeAIActions(userMessage, aiReply) {
    if (!APP.user) return;
    const uid = APP.user.uid;
    const msg = userMessage.toLowerCase();
  
    // If AI suggested adding a task and user explicitly asked to add one
    if ((msg.includes('add task') || msg.includes('create task') || msg.includes('new task')) && msg.length > 20) {
      // Extract task name from message (basic heuristic)
      const match = userMessage.match(/(?:add|create|new)\s+task[:\s]+(.+)/i);
      if (match && match[1]) {
        const taskName = match[1].trim();
        if (taskName.length > 2 && taskName.length < 100) {
          await addTaskDB(uid, { name: taskName, priority: 'med', category: 'personal', date: '' });
          appendAIMessage('bot', `✅ I've added the task **"${taskName}"** to your task list!`);
        }
      }
    }
  
    // If asked to add a reminder
    if (msg.includes('remind me') || msg.includes('set reminder')) {
      const timeMatch = userMessage.match(/\b(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i);
      const textMatch = userMessage.match(/remind me (?:to |at \S+ )?(.+)/i);
      if (timeMatch && textMatch) {
        let hour = parseInt(timeMatch[1]);
        const mins = timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
        const meridiem = timeMatch[3]?.toLowerCase();
        if (meridiem === 'pm' && hour < 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
        const time = `${String(hour).padStart(2, '0')}:${mins}`;
        await addReminderDB(uid, {
          text: textMatch[1].trim().substring(0, 80),
          time,
          type: 'priority-med',
        });
      }
    }
  }
  
  // ============================================================
  //  CHAT UI HELPERS
  // ============================================================
  
  function appendAIMessage(role, text) {
    const container = document.getElementById('ai-messages');
    if (!container) return;
  
    const userName = APP.profile?.firstName?.charAt(0) || APP.user?.email?.charAt(0) || 'U';
  
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
  
    const avatarContent = role === 'user' ? userName.toUpperCase() : '🤖';
  
    div.innerHTML = `
      <div class="ai-msg-avatar">${avatarContent}</div>
      <div class="ai-msg-bubble">${formatAIMessage(text)}</div>`;
  
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  
    // Also scroll the chat area
    const chatArea = document.getElementById('ai-chat-area');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }
  
  function showAITyping() {
    const container = document.getElementById('ai-messages');
    if (!container) return null;
  
    const id  = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-msg bot';
    div.id        = id;
    div.innerHTML = `
      <div class="ai-msg-avatar">🤖</div>
      <div class="ai-msg-bubble">
        <div class="ai-typing">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
  }
  
  function hideAITyping(id) {
    if (id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  }
  
  function formatAIMessage(text) {
    // Convert markdown-style formatting to HTML
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--surface3);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }
  
  // ============================================================
  //  HOOK INTO NAV — init AI when section is shown
  // ============================================================
  
  const _originalShowSection = window.showSection;
  window.showSection = function(name) {
    _originalShowSection(name);
    if (name === 'ai') initAI();
  };