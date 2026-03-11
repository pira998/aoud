import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AskQuestion } from '../types';
import { log } from '../lib/logger';

interface AskUserQuestionProps {
  id: string;
  questions: AskQuestion[];
  resolved?: boolean;
  onSubmit: (answers: Record<string, string>) => void;
}

export const AskUserQuestion: React.FC<AskUserQuestionProps> = ({
  id,
  questions,
  resolved,
  onSubmit,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customText, setCustomText] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLastQuestion = currentStep === questions.length - 1;
  const isSubmitStep = currentStep === questions.length;
  const question = isSubmitStep ? null : questions[currentStep];

  // Total options: question options + "Type something" + separator + "Chat about this" + "Skip"
  const baseOptions = question?.options || [];
  const totalOptions = baseOptions.length + 1 + 2; // +1 custom, +2 actions

  useEffect(() => {
    containerRef.current?.focus();
  }, [currentStep]);

  const handleSelect = useCallback((optionLabel: string) => {
    if (!question) return; // Guard against null question

    log.debug('AskUserQuestion', 'handleSelect called:', {
      questionHeader: question.header,
      optionLabel,
      currentStep,
      isLastQuestion,
      totalQuestions: questions.length
    });

    const newAnswers = { ...answers, [question.header]: optionLabel };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      // Move to Submit step instead of auto-submitting
      log.debug('AskUserQuestion', 'Last question answered, moving to Submit step');
      setCurrentStep(questions.length);
      setSelectedIndex(0);
      setShowCustom(false);
      setCustomText('');
    } else {
      log.debug('AskUserQuestion', 'Moving to next question');
      setCurrentStep((s) => s + 1);
      setSelectedIndex(0);
      setShowCustom(false);
      setCustomText('');
    }
  }, [answers, question, isLastQuestion, questions.length, currentStep]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (resolved) return;

    // Submit step keyboard handling
    if (isSubmitStep) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onSubmit(answers);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCurrentStep(questions.length - 1);
      }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalOptions - 1));
      setShowCustom(false);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      setShowCustom(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showCustom && customText.trim()) {
        handleSelect(customText.trim());
      } else if (selectedIndex < baseOptions.length) {
        handleSelect(baseOptions[selectedIndex].label);
      } else if (selectedIndex === baseOptions.length) {
        // "Type something"
        setShowCustom(true);
      } else if (selectedIndex === baseOptions.length + 1) {
        // "Chat about this"
        handleSelect('[Chat about this]');
      } else if (selectedIndex === baseOptions.length + 2 && question) {
        // "Skip"
        onSubmit({ ...answers, [question.header]: '[Skipped]' });
      }
    } else if (e.key === 'Escape') {
      if (showCustom) {
        setShowCustom(false);
      } else if (question) {
        onSubmit({ ...answers, [question.header]: '[Cancelled]' });
      }
    }
  }, [resolved, isSubmitStep, selectedIndex, totalOptions, baseOptions, showCustom, customText, handleSelect, onSubmit, answers, question, questions.length]);

  if (resolved) {
    return (
      <div className="ask-question ask-question--resolved">
        <div className="ask-question__resolved-label">Answered</div>
        <div className="ask-question__resolved-answers">
          {Object.entries(answers).map(([header, answer]) => (
            <span key={header} className="ask-question__resolved-answer">
              {header}: <strong>{answer}</strong>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Render Submit confirmation step
  if (isSubmitStep) {
    return (
      <div
        className="ask-question"
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="ask-question__phase">Planning:</div>
        <div className="ask-question__divider" />

        {/* Stepper with Submit highlighted */}
        <div className="ask-question__stepper">
          <span className="ask-question__stepper-arrow">{'\u2190'}</span>
          {questions.map((q, i) => (
            <span
              key={i}
              className="ask-question__step ask-question__step--completed ask-question__step--clickable"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                log.debug('AskUserQuestion', 'Submit step - navigating back to step:', i);
                setCurrentStep(i);
                setSelectedIndex(0);
                setShowCustom(false);
              }}
            >
              <span className="ask-question__step-check">{'\u2612'}</span>
              {q.header}
            </span>
          ))}
          <span className="ask-question__step ask-question__step--current">
            <span className="ask-question__step-check">{'\u2713'}</span>
            Submit
          </span>
          <span className="ask-question__stepper-arrow">{'\u2192'}</span>
        </div>

        {/* Review answers */}
        <div className="ask-question__submit-review">
          <div className="ask-question__submit-title">Review your answers:</div>
          {Object.entries(answers).map(([header, answer]) => (
            <div key={header} className="ask-question__submit-answer">
              <span className="ask-question__submit-header">{header}:</span>
              <span className="ask-question__submit-value">{answer}</span>
            </div>
          ))}
        </div>

        {/* Submit actions */}
        <div className="ask-question__submit-actions">
          <button
            type="button"
            className="ask-question__submit-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              log.info('AskUserQuestion', 'Submit clicked, answers:', answers);
              onSubmit(answers);
            }}
          >
            Submit
          </button>
          <button
            type="button"
            className="ask-question__skip-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              log.info('AskUserQuestion', 'Skip clicked');
              onSubmit({ ...answers, '__skipped': 'true' });
            }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (!question) return null;

  return (
    <div
      className="ask-question"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Header label */}
      <div className="ask-question__phase">Planning:</div>
      <div className="ask-question__divider" />

      {/* Stepper */}
      <div className="ask-question__stepper">
        <span className="ask-question__stepper-arrow">{'\u2190'}</span>
        {questions.map((q, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          const isAnswered = answers[q.header] !== undefined;
          const canClick = isCompleted || isCurrent;

          return (
            <span
              key={i}
              className={`ask-question__step ${isCurrent ? 'ask-question__step--current' : ''} ${isCompleted ? 'ask-question__step--completed' : ''} ${canClick ? 'ask-question__step--clickable' : ''}`}
              onClick={(e) => {
                if (canClick) {
                  e.preventDefault();
                  e.stopPropagation();
                  log.debug('AskUserQuestion', 'Tab clicked, navigating to step:', i);
                  setCurrentStep(i);
                  setSelectedIndex(0);
                  setShowCustom(false);
                }
              }}
            >
              <span className="ask-question__step-check">
                {isCompleted ? '\u2612' : isCurrent ? '\u2610' : '\u2610'}
              </span>
              {q.header}
            </span>
          );
        })}
        <span
          className={`ask-question__step ${isSubmitStep ? 'ask-question__step--current' : ''} ${Object.keys(answers).length === questions.length ? 'ask-question__step--clickable' : ''}`}
          onClick={(e) => {
            if (Object.keys(answers).length === questions.length) {
              e.preventDefault();
              e.stopPropagation();
              log.debug('AskUserQuestion', 'Submit tab clicked');
              setCurrentStep(questions.length);
            }
          }}
        >
          <span className="ask-question__step-check">{'\u2713'}</span>
          Submit
        </span>
        <span className="ask-question__stepper-arrow">{'\u2192'}</span>
      </div>

      {/* Question */}
      <div className="ask-question__question">{question.question}</div>

      {/* Options */}
      <div className="ask-question__options">
        {baseOptions.map((opt: { label: string; description: string }, i: number) => (
          <div
            key={i}
            className={`ask-question__option ${selectedIndex === i ? 'ask-question__option--active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              log.debug('AskUserQuestion', 'Option clicked:', opt.label);
              setSelectedIndex(i);
              handleSelect(opt.label);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            <span className="ask-question__option-indicator">
              {selectedIndex === i ? '\u276F' : ' '}
            </span>
            <span className="ask-question__option-number">{i + 1}.</span>
            <div className="ask-question__option-content">
              <span className={`ask-question__option-label ${i === 0 ? 'ask-question__option-label--recommended' : ''}`}>
                {opt.label}
                {i === 0 && <span className="ask-question__option-tag">(Recommended)</span>}
              </span>
              <span className="ask-question__option-desc">{opt.description}</span>
            </div>
          </div>
        ))}

        {/* Type something option */}
        <div
          className={`ask-question__option ${selectedIndex === baseOptions.length ? 'ask-question__option--active' : ''}`}
          onClick={() => {
            setSelectedIndex(baseOptions.length);
            setShowCustom(true);
          }}
          onMouseEnter={() => setSelectedIndex(baseOptions.length)}
        >
          <span className="ask-question__option-indicator">
            {selectedIndex === baseOptions.length ? '\u276F' : ' '}
          </span>
          <span className="ask-question__option-number">{baseOptions.length + 1}.</span>
          <div className="ask-question__option-content">
            {showCustom ? (
              <input
                className="ask-question__custom-input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customText.trim()) {
                    e.stopPropagation();
                    handleSelect(customText.trim());
                  }
                }}
                placeholder="Type your answer..."
                autoFocus
              />
            ) : (
              <span className="ask-question__option-label">Type something.</span>
            )}
          </div>
        </div>

        {/* Separator */}
        <div className="ask-question__separator" />

        {/* Chat about this */}
        <div
          className={`ask-question__option ${selectedIndex === baseOptions.length + 1 ? 'ask-question__option--active' : ''}`}
          onClick={() => handleSelect('[Chat about this]')}
          onMouseEnter={() => setSelectedIndex(baseOptions.length + 1)}
        >
          <span className="ask-question__option-indicator">
            {selectedIndex === baseOptions.length + 1 ? '\u276F' : ' '}
          </span>
          <span className="ask-question__option-number">{baseOptions.length + 2}.</span>
          <div className="ask-question__option-content">
            <span className="ask-question__option-label">Chat about this</span>
          </div>
        </div>

        {/* Skip */}
        <div
          className={`ask-question__option ${selectedIndex === baseOptions.length + 2 ? 'ask-question__option--active' : ''}`}
          onClick={() => onSubmit({ ...answers, [question.header]: '[Skipped]' })}
          onMouseEnter={() => setSelectedIndex(baseOptions.length + 2)}
        >
          <span className="ask-question__option-indicator">
            {selectedIndex === baseOptions.length + 2 ? '\u276F' : ' '}
          </span>
          <span className="ask-question__option-number">{baseOptions.length + 3}.</span>
          <div className="ask-question__option-content">
            <span className="ask-question__option-label">Skip interview and plan immediately</span>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="ask-question__hint">
        Enter to select &middot; Tab/Arrow keys to navigate &middot; Esc to cancel
      </div>
    </div>
  );
};
