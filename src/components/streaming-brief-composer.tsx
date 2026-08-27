"use client";

import Image from "next/image";
import { type CSSProperties, type FormEvent, useEffect, useId, useRef, useState } from "react";

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

const modeCopy: Record<StreamingBriefMode, { title: string; detail: string }> = {
  unified: {
    title: "Tell Folloze what to build.",
    detail: "One missing signal at a time. Your answers stay in this transcript, and the Live Brief stays editable."
  },
  campaign: {
    title: "Tell Folloze what you want to launch.",
    detail: "One question at a time. The Live Brief stays visible and editable while Folloze interprets your answers."
  },
  event: {
    title: "Tell Folloze what you want to promote.",
    detail: "Describe the webinar or field event. Folloze asks only what is still missing, then keeps the page visible while it builds."
  }
};

export type StreamingBriefComposerProps = {
  mode: StreamingBriefMode;
  questions: readonly StreamingBriefQuestion[];
  currentQuestionId?: string;
  answers: readonly StreamingBriefAnswer[];
  brief?: Readonly<Record<string, string | undefined>>;
  summaryFields?: readonly StreamingBriefSummaryField[];
  disabled?: boolean;
  onAnswer: (answer: StreamingBriefAnswer) => void;
  onStepChange?: (questionId: string) => void;
  onSummaryEdit?: (fieldKey: StreamingBriefSummaryField["key"]) => void;
};

export function StreamingBriefComposer({
  mode,
  questions,
  currentQuestionId,
  answers,
  brief = {},
  summaryFields = [],
  disabled = false,
  onAnswer,
  onStepChange,
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
            <div className={styles.questionHeading}>
              <label htmlFor={`streaming-brief-${currentQuestion.id}`}>
                <strong>{currentQuestion.prompt}</strong>
              </label>
              <span className={styles.step}>Question {stepIndex} of {questions.length}</span>
            </div>
            {currentQuestion.hint && <p className={styles.questionHint}>{currentQuestion.hint}</p>}
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
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}

const buildSceneImages = [
  { src: "/entry/campaign-preview.webp", alt: "A campaign landing page taking shape" },
  { src: "/entry/abm-preview.webp", alt: "A buyer-focused page layout taking shape" },
  { src: "/entry/content-preview.webp", alt: "An interactive content layout taking shape" }
] as const;

export type StreamingBuildStageProps = {
  audience: string;
  brandName: string;
  brandLogoUrl?: string;
  brandColors?: readonly string[];
  receipts: readonly StreamingBriefReceipt[];
};

export function StreamingBuildStage({
  audience,
  brandName,
  brandLogoUrl,
  brandColors = [],
  receipts
}: StreamingBuildStageProps) {
  const sceneStyle = {
    "--build-accent": brandColors[0] || "#0077ff",
    "--build-accent-two": brandColors[1] || "#17b890"
  } as CSSProperties;

  return (
    <section
      className={styles.buildStage}
      style={sceneStyle}
      data-build-stage="active"
      aria-labelledby="streaming-build-title"
      aria-busy="true"
    >
      <div className={styles.buildStageInner}>
        <div className={styles.buildNarrative} role="status" aria-live="polite" aria-atomic="true">
          {brandLogoUrl && (
            <span className={styles.buildBrandMark}>
              <Image src={brandLogoUrl} alt={`${brandName} logo`} width={156} height={52} unoptimized />
            </span>
          )}
          <h1 id="streaming-build-title">Building a buyer experience for {audience}.</h1>
          <p>Folloze is combining {brandName}&apos;s brand, offer, audience, and objective into one guided page.</p>
          <ol className={styles.buildReceipts} aria-label="Live build progress">
            {receipts.map((receipt) => (
              <li key={receipt.id} data-state={receipt.state || "working"}>
                <span aria-hidden="true" />
                <div>
                  <strong>{receipt.label}</strong>
                  <p>{receipt.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.buildVisual} aria-label="Folloze is composing page layouts and buyer paths">
          <div className={styles.orbitRoad} data-motion="orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className={styles.orbitCards} aria-hidden="true">
            {buildSceneImages.map((image, index) => (
              <figure key={image.src} className={styles.orbitCard} data-position={index + 1}>
                <Image src={image.src} alt="" width={720} height={380} priority={index === 0} />
              </figure>
            ))}
          </div>
          <p className={styles.buildVisualCaption}>Brand system, message, and page structure are being assembled together.</p>
        </div>
      </div>
    </section>
  );
}
