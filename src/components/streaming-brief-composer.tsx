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

export type StreamingAudienceFinding = {
  id: string;
  label: string;
  text: string;
};

const modeCopy: Record<StreamingBriefMode, { eyebrow: string; title: string; detail: string }> = {
  campaign: {
    eyebrow: "Campaign brief",
    title: "Tell Folloze what you want to launch.",
    detail: "One question at a time. The Live Brief on the right is the source of truth. Preview as soon as three signals are in place."
  },
  event: {
    eyebrow: "Event brief",
    title: "Tell Folloze what you want to promote.",
    detail: "Describe the webinar or field event. Folloze will ask only what is still missing, then keep the page visible while it builds."
  }
};

export type StreamingBriefComposerProps = {
  mode: StreamingBriefMode;
  questions: readonly StreamingBriefQuestion[];
  currentQuestionId?: string;
  answers: readonly StreamingBriefAnswer[];
  receipts?: readonly StreamingBriefReceipt[];
  brief?: Readonly<Record<string, string | undefined>>;
  canSkip?: boolean;
  skipLabel?: string;
  disabled?: boolean;
  onAnswer: (answer: StreamingBriefAnswer) => void;
  onStepChange?: (questionId: string) => void;
  onSkip?: () => void;
};

export function StreamingBriefComposer({
  mode,
  questions,
  currentQuestionId,
  answers,
  receipts = [],
  brief = {},
  canSkip = false,
  skipLabel = "Skip to preview",
  disabled = false,
  onAnswer,
  onStepChange,
  onSkip
}: StreamingBriefComposerProps) {
  const [draft, setDraft] = useState("");
  const descriptionId = useId();
  const copy = modeCopy[mode];
  const currentQuestion = questions.find((question) => question.id === currentQuestionId)
    ?? questions.find((question) => !answers.some((answer) => answer.questionId === question.id));
  const answerForCurrent = currentQuestion
    ? answers.find((answer) => answer.questionId === currentQuestion.id)?.value
    : undefined;
  const value = draft || answerForCurrent || "";
  const stepIndex = currentQuestion
    ? Math.max(questions.findIndex((question) => question.id === currentQuestion.id) + 1, 1)
    : questions.length;
  const completedAnswers = answers.filter((answer) => answer.questionId !== currentQuestion?.id);

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
        {completedAnswers.map((answer) => (
          <button
            type="button"
            className={styles.turn}
            key={`${answer.questionId}:${answer.value}`}
            disabled={disabled || !onStepChange}
            onClick={() => onStepChange?.(answer.questionId)}
          >
            <small>{answer.label}</small>
            <strong>{answer.value}</strong>
            <span>Edit</span>
          </button>
        ))}
        {currentQuestion ? (
          <form className={styles.question} onSubmit={submit} aria-describedby={descriptionId}>
            <span className={styles.step}>Question {stepIndex} of {questions.length}</span>
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
              <button type="submit" disabled={disabled || !value.trim()} aria-label="Send answer">
                Send <span aria-hidden="true">→</span>
              </button>
              {onSkip && (
                <button
                  type="button"
                  className={styles.skip}
                  disabled={disabled || !canSkip}
                  onClick={onSkip}
                >
                  {skipLabel}
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className={styles.complete} role="status">
            <p>Your brief has the inputs needed to build.</p>
            {onSkip && (
              <button type="button" className={styles.skip} disabled={disabled} onClick={onSkip}>
                {skipLabel}
              </button>
            )}
          </div>
        )}
      </div>

      <section className={styles.receipts} aria-live="polite" aria-atomic="false" aria-label="Live build progress">
        {receipts.map((receipt) => (
          <p key={receipt.id} data-state={receipt.state || "working"}>
            <strong>{receipt.label}</strong>
            <span>{receipt.detail}</span>
          </p>
        ))}
      </section>

      {Object.values(brief).some(Boolean) && (
        <p className={styles.briefHint}>Live Brief is updating in the sidebar. Change any signal there or edit a previous answer.</p>
      )}
    </section>
  );
}
