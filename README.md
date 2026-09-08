[README.md](https://github.com/user-attachments/files/31966073/README.md)

## App Overview
- App Name: ParkPlanner Chat
- Short Description: A browser-based TypeScript chatbot for urban park and green space planning.
- Ollama Model Used: qwen2.5:3b
- VS Code Agent / Coding Model Used: Codex

## Prompt Workflow
- Prompt Generator Used: ChatGPT
- 3 Details I Changed From the Example Prompt:
  1. Model changed to qwen2.5:3b for laptop performance.
  2. UI layout improved with sidebar calculators and park metric chips.
  3. Quick-action wording and assistant behavior personalized for urban park planning.

## Features
- Core Features:
  - Real Ollama REST API connection
  - Streaming NDJSON response
  - Conversation history
  - Dark/light mode
  - Clear conversation
  - 4 quick-action buttons
  - Ollama error banner
- Bonus Features:
  - Export chat as .txt
  - 10-minute walk radius calculator
  - Per-capita park area calculator

## Installation and Run
npm install
npm run build
npm run dev

## Strengths and Limits
- What works well: Provides park planning calculations, quick actions, and live streaming responses.
- Known issues or limits: Response quality depends on the local Ollama model and whether Ollama is running.

## Screenshots
- Screenshot 1: Light mode
- Screenshot 2: Dark mode
- Screenshot 3: Quick-action button in use
- Screenshot 4: Bonus calculator
