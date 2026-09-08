type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const SYSTEM_PROMPT =
  "You are ParkPlanner, an urban park designer with 20 years of experience in public green space. You specialize in per-capita green area standards (WHO: 9 m²/person; NRPA: 40.5 m²/person), biodiversity-friendly landscaping, playground safety per EN 1176, 10-minute walk service area analysis (400-800m walking catchment), and park zone programming. Every design recommendation includes area calculations and citations. Reference WHO, UN-Habitat, NRPA, or EN 1176 as applicable. Decline questions outside park design and green space planning.";

const MODEL = "qwen2.5:3b";
const API_URL = "http://localhost:11434/api/chat";
const MAX_CHARS = 2000;

let conversationHistory: ChatMessage[] = [];
let isStreaming = false;

const messagesEl = getElement<HTMLDivElement>("messages");
const formEl = getElement<HTMLFormElement>("chatForm");
const promptInput = getElement<HTMLTextAreaElement>("promptInput");
const sendButton = getElement<HTMLButtonElement>("sendButton");
const charCounter = getElement<HTMLDivElement>("charCounter");
const errorBanner = getElement<HTMLDivElement>("errorBanner");
const themeToggle = getElement<HTMLButtonElement>("themeToggle");
const clearChat = getElement<HTMLButtonElement>("clearChat");
const exportChat = getElement<HTMLButtonElement>("exportChat");
const walkSpeed = getElement<HTMLInputElement>("walkSpeed");
const walkRadius = getElement<HTMLOutputElement>("walkRadius");
const population = getElement<HTMLInputElement>("population");
const parkArea = getElement<HTMLInputElement>("parkArea");
const areaResult = getElement<HTMLOutputElement>("areaResult");

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMarkdown(markdown: string): string {
  let html = escapeHtml(markdown);
  const blocks: string[] = [];

  html = html.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    const index = blocks.push(`<pre><code>${code.trim()}</code></pre>`) - 1;
    return `@@BLOCK_${index}@@`;
  });

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  const lines = html.split(/\n/);
  const rendered: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      rendered.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*-\s+(.+)/);
    if (bullet) {
      listItems.push(`<li>${bullet[1]}</li>`);
      continue;
    }

    flushList();
    if (line.trim() === "") {
      continue;
    }
    rendered.push(`<p>${line}</p>`);
  }

  flushList();

  return rendered.join("").replace(/@@BLOCK_(\d+)@@/g, (_match, index: string) => blocks[Number(index)]);
}

function applyParkChips(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest("code, pre, .park-chip")) {
      continue;
    }
    if (/(400\s*-\s*800\s*m|400-800m|\d+(?:\.\d+)?\s*m²\/person|EN\s*1176|WHO|NRPA|UN-Habitat)/i.test(node.data)) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const fragment = document.createDocumentFragment();
    const parts = node.data.split(/(400\s*-\s*800\s*m|400-800m|\d+(?:\.\d+)?\s*m²\/person|EN\s*1176|WHO|NRPA|UN-Habitat)/gi);

    for (const part of parts) {
      if (/^(400\s*-\s*800\s*m|400-800m|\d+(?:\.\d+)?\s*m²\/person|EN\s*1176|WHO|NRPA|UN-Habitat)$/i.test(part)) {
        const chip = document.createElement("span");
        chip.className = "park-chip";
        chip.textContent = part;
        fragment.appendChild(chip);
      } else if (part) {
        fragment.appendChild(document.createTextNode(part));
      }
    }

    node.replaceWith(fragment);
  }
}

function addMessage(role: "user" | "assistant", content: string, streaming = false): HTMLDivElement {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.innerHTML = renderMarkdown(content) + (streaming ? '<span class="cursor">|</span>' : "");
  messagesEl.appendChild(message);
  applyParkChips(message);
  scrollToBottom();
  return message;
}

function updateAssistantMessage(element: HTMLElement, content: string, streaming: boolean): void {
  element.innerHTML = renderMarkdown(content) + (streaming ? '<span class="cursor">|</span>' : "");
  applyParkChips(element);
  scrollToBottom();
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStreaming(value: boolean): void {
  isStreaming = value;
  sendButton.disabled = value;
  promptInput.disabled = value;
}

function updateTextarea(): void {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 99)}px`;
  charCounter.textContent = `${promptInput.value.length} / ${MAX_CHARS}`;
}

async function submitPrompt(prompt: string): Promise<void> {
  const trimmed = prompt.trim();
  if (!trimmed || isStreaming) {
    return;
  }

  errorBanner.hidden = true;
  promptInput.value = "";
  updateTextarea();
  addMessage("user", trimmed);
  conversationHistory.push({ role: "user", content: trimmed });

  const assistantEl = addMessage("assistant", "", true);
  let assistantText = "";
  setStreaming(true);

  try {
    const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...conversationHistory];
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, stream: true })
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
          continue;
        }

        const chunk = JSON.parse(trimmedLine) as { done?: boolean; message?: { content?: string } };
        if (chunk.message?.content) {
          assistantText += chunk.message.content;
          updateAssistantMessage(assistantEl, assistantText, true);
        }

        if (chunk.done === true) {
          finishAssistantMessage(assistantEl, assistantText);
          return;
        }
      }
    }

    if (buffer.trim()) {
      const chunk = JSON.parse(buffer.trim()) as { done?: boolean; message?: { content?: string } };
      assistantText += chunk.message?.content ?? "";
    }
    finishAssistantMessage(assistantEl, assistantText);
  } catch (_error) {
    errorBanner.hidden = false;
    assistantEl.remove();
  } finally {
    setStreaming(false);
  }
}

function finishAssistantMessage(element: HTMLElement, content: string): void {
  updateAssistantMessage(element, content || "No response received.", false);
  conversationHistory.push({ role: "assistant", content: content || "No response received." });
}

function updateWalkRadius(): void {
  const speed = Number(walkSpeed.value) || 0;
  const meters = Math.round((speed * 1000) / 6);
  walkRadius.textContent = `${meters} m in 10 min`;
}

function updateAreaResult(): void {
  const people = Number(population.value);
  const area = Number(parkArea.value);

  if (people <= 0 || area < 0) {
    areaResult.textContent = "Enter a valid population";
    return;
  }

  const provision = area / people;
  const who = provision >= 9 ? "meets WHO" : "below WHO";
  const nrpa = provision >= 40.5 ? "meets NRPA" : "below NRPA";
  areaResult.textContent = `${provision.toFixed(1)} m²/person ${who}, ${nrpa}`;
}

function exportConversation(): void {
  const body = conversationHistory
    .map((message) => `${message.role.toUpperCase()}\n${message.content}`)
    .join("\n\n");
  const blob = new Blob([body || "No conversation yet."], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "parkplanner-chat.txt";
  link.click();
  URL.revokeObjectURL(url);
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitPrompt(promptInput.value);
});

promptInput.addEventListener("input", updateTextarea);

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    formEl.requestSubmit();
  }
});

document.querySelectorAll<HTMLButtonElement>(".quick-action").forEach((button) => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt ?? "";
    updateTextarea();
    void submitPrompt(promptInput.value);
  });
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  themeToggle.textContent = document.body.classList.contains("dark") ? "☀" : "☾";
});

clearChat.addEventListener("click", () => {
  conversationHistory = [];
  messagesEl.innerHTML = "";
  errorBanner.hidden = true;
});

exportChat.addEventListener("click", exportConversation);
walkSpeed.addEventListener("input", updateWalkRadius);
population.addEventListener("input", updateAreaResult);
parkArea.addEventListener("input", updateAreaResult);

updateTextarea();
updateWalkRadius();
updateAreaResult();
addMessage(
  "assistant",
  "**ParkPlanner is ready.** Ask for per-capita green space checks, 400-800m access planning, EN 1176 playground implications, or zone programming with area calculations."
);
