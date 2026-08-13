"use client";

import { type FormEvent, useId, useState } from "react";

import styles from "./streaming-brief-composer.module.css";

export type StreamingBriefMode = "campaign" | "event";

export type StreamingBriefQuestion = {
  id: string;
  label: string;
  prompt: string;
  hint?: string;
  choices?: readonly string[];
  placeholder?: string;
  required?: boolean;
};

export type StreamingBriefAnswer = {
  questionId: string;
  label: string;
  value: string;
};

export type StreamingBriefReceipt = {
  id: string;
  label: string;
  detail: string;
  state?: "working" | "complete" | "attention";
};

export type StreamingBriefComposerProps = {
  mode: StreamingBriefMode;
  questions: readonly StreamingBriefQuestion[];
  currentQuestionId?: string;
  answers: readonly StreamingBriefAnswer[];
  receipts?: readonly StreamingBriefReceipt[];
  brief?: Readonly<Record<string, string | undefined>>;
  disabled?: boolean;
  onAnswer: (answer: StreamingBriefAnswer) => void;
  onStepChange?: (questionId: string) => void;
};

const modeCopy: Record<StreamingBriefMode, { eyebrow: string; title: string; detail: string }> = {
  campaign: {
    eyebrow: "Campaign Agent",
    title: "Tell Folloze what you want to launch.",
    detail: "Answer in plain language. I’ll consolidate the useful signals and ask only what is missing."
  },
  event: {
    eyebrow: "Campaign Agent · Event mode",
    title: "Tell Folloze what you want to promote.",
    detail: "Describe the webinar or field event. I’ll shape the reason to attend and the registration path."
  }
};

export function StreamingBriefComposer({
  mode,
  questions,
  currentQuestionId,
  answers,
  receipts = [],
  brief = {},
  disabled = false,
  onAnswer,
  onStepChange
}: StreamingBriefComposerProps) {
  const [draft, setDraft] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const descriptionId = useId();
  const copy = modeCopy[mode];
  const currentQuestion = questions.find((question) => question.id === currentQuestionId)
    ?? questions.find((question) => !answers.some((answer) => answer.questionId === question.id));
  const answerForCurrent = currentQuestion
    ? answers.find((answer) => answer.questionId === currentQuestion.id)?.value
    : undefined;
  const value = draft || answerForCurrent || "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentQuestion || !value.trim()) return;
    onAnswer({ questionId: currentQuestion.id, label: currentQuestion.label, value: value.trim() });
    setDraft("");
  };

  return (
    <section className={styles.composer} aria-labelledby="streaming-brief-title">
      <header className={styles.header}>
        <span><i aria-hidden="true" />{copy.eyebrow}</span>
        <h2 id="streaming-brief-title">{copy.title}</h2>
        <p id={descriptionId}>{copy.detail}</p>
      </header>

      <div className={styles.stream} aria-label="Brief conversation">
        {answers.map((answer) => (
          <article className={styles.answer} key={`${answer.questionId}:${answer.value}`}>
            <small>{answer.label}</small>
            <p>{answer.value}</p>
          </article>
        ))}
        {currentQuestion ? (
          <form className={styles.question} onSubmit={submit} aria-describedby={descriptionId}>
            <span className={styles.step}>Step {Math.max(questions.findIndex((question) => question.id === currentQuestion.id) + 1, 1)} of {questions.length}</span>
            <label htmlFor={`streaming-brief-${currentQuestion.id}`}>
              <strong>{currentQuestion.prompt}</strong>
              {currentQuestion.hint && <small>{currentQuestion.hint}</small>}
            </label>
            {currentQuestion.choices && currentQuestion.choices.length > 0 && (
              <div className={styles.chips} role="group" aria-label={currentQuestion.label}>
                {currentQuestion.choices.map((choice) => (
                  <button
                    type="button"
                    key={choice}
                    className={value === choice ? styles.selected : undefined}
                    aria-pressed={value === choice}
                    disabled={disabled}
                    onClick={() => {
                      onAnswer({ questionId: currentQuestion.id, label: currentQuestion.label, value: choice });
                      setDraft("");
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
            <textarea
              id={`streaming-brief-${currentQuestion.id}`}
              value={value}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={currentQuestion.placeholder || "Add a short answer"}
              disabled={disabled}
              required={currentQuestion.required}
              rows={3}
            />
            <div className={styles.actions}>
              <button type="submit" disabled={disabled || !value.trim()} aria-label="Send answer">Send <span aria-hidden="true">→</span></button>
              {onStepChange && questions.length > 1 && (
                <select
                  aria-label="Change brief question"
                  value={currentQuestion.id}
                  disabled={disabled}
                  onChange={(event) => {
                    setDraft("");
                    onStepChange(event.target.value);
                  }}
                >
                  {questions.map((question) => <option key={question.id} value={question.id}>{question.label}</option>)}
                </select>
              )}
            </div>
          </form>
        ) : <p className={styles.complete} role="status">Your brief has the inputs needed to build.</p>}
      </div>

      <section className={styles.receipts} aria-live="polite" aria-atomic="false" aria-label="Live build progress">
        {receipts.map((receipt) => (
          <p key={receipt.id} data-state={receipt.state || "working"}><strong>{receipt.label}</strong><span>{receipt.detail}</span></p>
        ))}
      </section>

      <details className={styles.brief} open={briefOpen} onToggle={(event) => setBriefOpen(event.currentTarget.open)}>
        <summary>Live Brief <span>{Object.values(brief).filter(Boolean).length} details</span></summary>
        <dl>{Object.entries(brief).filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </details>
    </section>
  );
}
