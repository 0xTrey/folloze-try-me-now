"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import styles from "./streaming-brief-composer.module.css";

export type StreamingBriefMode = "campaign" | "event" | "unified";

export type StreamingBriefQuestion = {
  id: string;
  label: string;
  prompt: string;
  hint?: string;
  choices?: readonly string[];
  recommendedChoice?: string;
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

export type StreamingBriefSummaryField = {
  key: "seller" | "target" | "audience" | "offer" | "objective" | "experience_type";
  label: string;
  value?: string;
  editable?: boolean;
};

const modeCopy: Record<StreamingBriefMode, { eyebrow: string; title: string; detail: string }> = {
  unified: {
    eyebrow: "Buyer experience",
    title: "Tell Folloze what to build.",
    detail: "One missing signal at a time. Your answers stay in this transcript, and the Live Brief stays editable."
  },
  campaign: {
    eyebrow: "Campaign brief",
    title: "Tell Folloze what you want to launch.",
    detail: "One question at a time. The Live Brief stays visible and editable while Folloze interprets your answers."
  },
  event: {
    eyebrow: "Event brief",
    title: "Tell Folloze what you want to promote.",
    detail: "Describe the webinar or field event. Folloze asks only what is still missing, then keeps the page visible while it builds."
  }
};

export type StreamingBriefComposerProps = {
  mode: StreamingBriefMode;
  questions: readonly StreamingBriefQuestion[];
  currentQuestionId?: string;
  answers: readonly StreamingBriefAnswer[];
  receipts?: readonly StreamingBriefReceipt[];
  brief?: Readonly<Record<string, string | undefined>>;
  summaryFields?: readonly StreamingBriefSummaryField[];
  canSkip?: boolean;
  skipLabel?: string;
  disabled?: boolean;
  onAnswer: (answer: StreamingBriefAnswer) => void;
  onStepChange?: (questionId: string) => void;
  onSkip?: () => void;
  onSummaryEdit?: (fieldKey: StreamingBriefSummaryField["key"]) => void;
};

export function StreamingBriefComposer({
  mode,
  questions,
  currentQuestionId,
  answers,
  receipts = [],
  brief = {},
  summaryFields = [],
  canSkip = false,
  skipLabel = "Skip to preview",
  disabled = false,
  onAnswer,
  onStepChange,
  onSkip,
  onSummaryEdit
}: StreamingBriefComposerProps) {
  const [draft, setDraft] = useState("");
  const descriptionId = useId();
  const summaryId = useId();
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const copy = modeCopy[mode];
  const currentQuestion = questions.find((question) => question.id === currentQuestionId)
    ?? questions.find((question) => !answers.some((answer) => answer.questionId === question.id));
  const activeQuestionId = currentQuestion?.id;
  const answerForCurrent = currentQuestion
    ? answers.find((answer) => answer.questionId === currentQuestion.id)?.value
    : undefined;
  const value = draft || answerForCurrent || "";
  const stepIndex = currentQuestion
    ? Math.max(questions.findIndex((question) => question.id === currentQuestion.id) + 1, 1)
    : questions.length;
  const completedAnswers = answers.filter((answer) => answer.questionId !== currentQuestion?.id);
  const visibleSummary = summaryFields.length > 0
    ? summaryFields
    : Object.entries(brief)
      .filter(([, fieldValue]) => Boolean(fieldValue))
      .map(([label, fieldValue]) => ({
        key: label.toLowerCase().replace(/\s+/g, "_") as StreamingBriefSummaryField["key"],
        label,
        value: fieldValue,
        editable: false
      }));

  useEffect(() => {
    if (!activeQuestionId || disabled) return;
    questionInputRef.current?.focus();
  }, [activeQuestionId, disabled]);

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

      {visibleSummary.length > 0 && (
        <section className={styles.summary} aria-labelledby={summaryId}>
          <div className={styles.summaryHeader}>
            <h3 id={summaryId}>Live Brief</h3>
            <span>Editable anytime</span>
          </div>
          <ul className={styles.summaryList}>
            {visibleSummary.map((field) => {
              const complete = Boolean(field.value?.trim());
              const content = (
                <>
                  <small>{field.label}</small>
                  <strong>{field.value?.trim() || "Waiting"}</strong>
                </>
              );
              if (field.editable && onSummaryEdit) {
                return (
                  <li key={field.key}>
                    <button
                      type="button"
                      className={complete ? styles.summaryComplete : styles.summaryPending}
                      disabled={disabled}
                      onClick={() => onSummaryEdit(field.key)}
                      aria-label={`Edit ${field.label}`}
                    >
                      {content}
                      <span>Edit</span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={field.key} className={complete ? styles.summaryComplete : styles.summaryPending}>
                  <div>{content}</div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className={styles.stream} aria-label="Brief conversation" role="log" aria-live="polite">
        {completedAnswers.map((answer) => {
          const question = questions.find((candidate) => candidate.id === answer.questionId);
          return (
            <button
              type="button"
              className={styles.turn}
              key={`${answer.questionId}:${answer.value}`}
              disabled={disabled || !onStepChange}
              onClick={() => onStepChange?.(answer.questionId)}
              aria-label={`Edit ${answer.label}: ${answer.value}`}
            >
              <small>{answer.label}</small>
              {question?.prompt && <em className={styles.turnPrompt}>{question.prompt}</em>}
              <strong>{answer.value}</strong>
              <span>Edit</span>
            </button>
          );
        })}
        {currentQuestion ? (
          <form className={styles.question} onSubmit={submit} aria-describedby={descriptionId}>
            <span className={styles.step}>Next signal · {currentQuestion.label}</span>
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
                    aria-label={
                      currentQuestion.recommendedChoice === choice
                        ? `${choice}, recommended`
                        : choice
                    }
                    disabled={disabled}
                    onClick={() => {
                      onAnswer({ questionId: currentQuestion.id, label: currentQuestion.label, value: choice });
                      setDraft("");
                    }}
                  >
                    {choice}
                    {currentQuestion.recommendedChoice === choice && <small>Recommended</small>}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={questionInputRef}
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
            <p className={styles.progressHint} aria-hidden="true">
              Question {stepIndex} of {questions.length}
            </p>
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
    </section>
  );
}
