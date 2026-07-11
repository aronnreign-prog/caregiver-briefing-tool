---
name: strict-spec-adherence
description: Learnings from past mistakes regarding strictly following task lists and specifications.
---

# Strict Spec Adherence

This skill contains critical lessons learned from previous mistakes in this project. You MUST follow these rules to avoid repeating past failures.

## 1. Do Not Skip Ahead
- **Mistake made:** Blur tasks together (e.g., combining Task 8, 9, and 10 into one edge function without fulfilling all the requirements of each).
- **Rule:** Implement EXACTLY the task at hand. Do not attempt to implement the next task just because it seems logically adjacent. If you are on Task 8, only do the requirements listed under Task 8.

## 2. Read the Verify Section
- **Mistake made:** Missing required API calls (like fetching temporal trends or checking DDInter for contraindications) because the prompt was skimmed.
- **Rule:** Before writing any code, explicitly read the "Verify before committing" section for the current task. Your code must satisfy those exact verification conditions.

## 3. Use Provided Prompts & Schemas
- **Mistake made:** Ignoring the explicitly provided LLM prompt in the spec and making up a custom one, resulting in the wrong JSON structure.
- **Rule:** If the spec provides a prompt template, JSON structure, or specific output format, use it exactly as written.

## 4. When the Spec says "Write a plan first"
- **Mistake made:** Writing code immediately when the spec explicitly demanded writing a plan and getting user approval first (e.g., Task 10).
- **Rule:** Stop and output a plan. Wait for the user to reply "yes" before generating any code.

## 5. Documenting New Patterns
- When you discover a new architectural pattern or correct a mistake based on user feedback, document it here or in a relevant skill folder so it isn't lost.
