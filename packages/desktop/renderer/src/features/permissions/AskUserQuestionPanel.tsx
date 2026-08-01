import type { PermissionDecision } from '../../../../shared/protocol.js'
import { useRef, useState } from 'react'

export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion'

export type AskUserQuestionOption = {
  label: string
  description: string
  preview?: string
}

export type AskUserQuestion = {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOption(value: unknown): AskUserQuestionOption | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.label !== 'string' || !value.label) return undefined
  if (typeof value.description !== 'string') return undefined
  const option: AskUserQuestionOption = {
    label: value.label,
    description: value.description,
  }
  if (typeof value.preview === 'string' && value.preview) {
    option.preview = value.preview
  }
  return option
}

function parseQuestion(value: unknown): AskUserQuestion | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.question !== 'string' || !value.question) return undefined
  if (!Array.isArray(value.options)) return undefined
  const options = value.options
    .map(parseOption)
    .filter((option): option is AskUserQuestionOption => option !== undefined)
  if (options.length < 2) return undefined
  return {
    question: value.question,
    header: typeof value.header === 'string' ? value.header : '',
    options,
    multiSelect: value.multiSelect === true,
  }
}

/** Extracts the questions array from an AskUserQuestion tool input. */
export function parseAskUserQuestions(
  input: unknown,
): AskUserQuestion[] | undefined {
  if (!isRecord(input) || !Array.isArray(input.questions)) return undefined
  const questions = input.questions
    .map(parseQuestion)
    .filter((question): question is AskUserQuestion => question !== undefined)
  return questions.length > 0 ? questions : undefined
}

type AskUserQuestionPanelProps = {
  questions: AskUserQuestion[]
  onResolve: (decision: PermissionDecision, payload?: unknown) => void
}

/**
 * Multiple-choice dialog for the AskUserQuestion tool. Submits
 * `allow_once` with `{ answers }` as the permission payload, which the core
 * merges into the tool input — mirroring the TUI's updatedInput injection.
 */
export function AskUserQuestionPanel({
  questions,
  onResolve,
}: AskUserQuestionPanelProps): React.ReactNode {
  const submittedRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [multiDraft, setMultiDraft] = useState<ReadonlySet<string>>(new Set())
  const [otherText, setOtherText] = useState('')

  const current = questions[Math.min(currentIndex, questions.length - 1)]!
  const isLastQuestion = currentIndex >= questions.length - 1
  const singleQuestion = questions.length === 1

  const finish = (finalAnswers: Record<string, string>) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    onResolve('allow_once', { answers: finalAnswers })
  }

  const deny = () => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    onResolve('deny')
  }

  const advanceOrFinish = (nextAnswers: Record<string, string>) => {
    if (isLastQuestion || singleQuestion) {
      finish(nextAnswers)
      return
    }
    setAnswers(nextAnswers)
    setMultiDraft(new Set())
    setOtherText('')
    setCurrentIndex(index => index + 1)
  }

  const answerWith = (answer: string) => {
    if (submitting || !answer) return
    advanceOrFinish({ ...answers, [current.question]: answer })
  }

  const toggleMulti = (label: string) => {
    setMultiDraft(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  const confirmMulti = () => {
    if (multiDraft.size === 0) return
    // Keep the original option order for a stable, readable answer string.
    const ordered = current.options
      .map(option => option.label)
      .filter(label => multiDraft.has(label))
    answerWith(ordered.join(', '))
  }

  const submitOther = () => {
    const text = otherText.trim()
    if (text) answerWith(text)
  }

  const goBack = () => {
    if (currentIndex === 0 || submitting) return
    setCurrentIndex(index => index - 1)
    setMultiDraft(new Set())
    setOtherText('')
  }

  return (
    <section className="permission-panel ask-user-panel" aria-label="回答问题">
      <div className="permission-header">
        <strong>
          Claude 想问你{questions.length > 1 ? ` ${questions.length} 个问题` : '一个问题'}
        </strong>
        {questions.length > 1 ? (
          <span className="ask-user-progress">
            {currentIndex + 1} / {questions.length}
          </span>
        ) : null}
      </div>

      <div className="ask-user-question">
        {current.header ? (
          <span className="ask-user-chip">{current.header}</span>
        ) : null}
        <p className="ask-user-question-text">{current.question}</p>
      </div>

      <div
        className="ask-user-options"
        role={current.multiSelect ? 'group' : 'listbox'}
        aria-label={current.question}
      >
        {current.options.map(option => {
          const selected = current.multiSelect
            ? multiDraft.has(option.label)
            : answers[current.question] === option.label
          return (
            <button
              key={option.label}
              type="button"
              className="ask-user-option"
              data-selected={selected}
              disabled={submitting}
              onClick={() =>
                current.multiSelect ? toggleMulti(option.label) : answerWith(option.label)
              }
            >
              <span className="ask-user-option-label">{option.label}</span>
              <span className="ask-user-option-description">{option.description}</span>
            </button>
          )
        })}
      </div>

      <div className="ask-user-other">
        <input
          type="text"
          className="ask-user-other-input"
          placeholder="其他：输入自定义回答后回车"
          value={otherText}
          disabled={submitting}
          onChange={event => setOtherText(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitOther()
            }
          }}
        />
      </div>

      <div className="permission-actions ask-user-actions">
        {currentIndex > 0 ? (
          <button
            type="button"
            className="secondary-button"
            disabled={submitting}
            onClick={goBack}
          >
            上一题
          </button>
        ) : null}
        {current.multiSelect ? (
          <button
            type="button"
            className="permission-button"
            disabled={submitting || multiDraft.size === 0}
            onClick={confirmMulti}
          >
            确认选择
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          disabled={submitting}
          onClick={deny}
        >
          拒绝
        </button>
        {submitting ? <span className="permission-submitting">处理中…</span> : null}
      </div>
    </section>
  )
}
