---
name: antigravity-result-handling
description: Internal rules for presenting antigravity-cc wrapper output (reviews, delegated tasks, background jobs) to the user
user-invocable: false
---

# Presenting Antigravity results

- Show the wrapper output as-is. Keep the verdict, the findings in their severity order, the `file:line` references, the next steps and the final "🛰️ Respondido por Antigravity CLI" line. Do not summarize a review into prose.
- Keep evidence boundaries: if Antigravity marked something as an inference or gave it low confidence, keep that distinction.
- If there are no findings, say so in one line.
- After presenting review findings, STOP. Do not edit code. Ask the user which findings, if any, they want fixed. This holds even when a fix looks obvious.
- If Antigravity edited files (`delegate`, `task`), say so and confirm the real changes with `git status` / `git diff --stat` before treating the work as done.
- If a run failed, show the error line and the wrapper's diagnosis (lines after "DIAGNÓSTICO"), then stop. Do not redo the task yourself unless the user asks.
- If setup or sign-in is needed, point to `/antigravity:setup` or `/antigravity:login`. Do not improvise other authentication steps.
- For background jobs, report the job ID and the follow-up commands (`/antigravity:status <id>`, `/antigravity:result <id>`, `/antigravity:cancel <id>`). Do not poll in a loop unless the user asks you to wait.
