import { useState } from 'react'
import type { RendererSession } from '../../app/reducer.js'

type PlanProgressStep = {
  label: string
  description: string
  done: boolean
  active: boolean
}

export type PlanProgressState = {
  visible: boolean
  currentStep: number
  totalSteps: number
  steps: PlanProgressStep[]
}

function normalizedToolName(name: string): string {
  return name.replace(/[^a-z]/gi, '').toLowerCase()
}

function toolLooksReadOnly(name: string): boolean {
  const normalized = normalizedToolName(name)
  return [
    'read',
    'fileread',
    'grep',
    'glob',
    'ls',
    'webfetch',
    'websearch',
  ].some(candidate => normalized.includes(candidate))
}

function toolLooksPlanWrite(name: string, summary: string): boolean {
  const normalized = normalizedToolName(name)
  if (
    ![
      'write',
      'filewrite',
      'edit',
      'fileedit',
      'multiedit',
    ].some(candidate => normalized.includes(candidate))
  ) {
    return false
  }
  return /plan|计划|\.md/i.test(summary)
}

function isActiveState(state: string): boolean {
  return state === 'pending' || state === 'running'
}

function isDoneState(state: string): boolean {
  return state === 'success'
}

export function derivePlanProgress(session: RendererSession): PlanProgressState {
  const tools = Object.values(session.tools)
  const permissions = Object.values(session.permissions)
  const planModeSeen =
    session.mode === 'plan' ||
    tools.some(tool => normalizedToolName(tool.name).includes('planmode')) ||
    tools.some(tool => normalizedToolName(tool.name).includes('exitplanmode')) ||
    permissions.some(request => normalizedToolName(request.toolName).includes('exitplanmode'))

  const readTools = tools.filter(tool => toolLooksReadOnly(tool.name))
  const planWriteTools = tools.filter(tool =>
    toolLooksPlanWrite(tool.name, `${tool.summary ?? ''} ${JSON.stringify(tool.input ?? {})}`),
  )
  const exitPlanTools = tools.filter(tool =>
    normalizedToolName(tool.name).includes('exitplanmode'),
  )
  const exitPlanPermission = permissions.some(request =>
    normalizedToolName(request.toolName).includes('exitplanmode'),
  )
  const running = session.generationState === 'running' || session.generationState === 'interrupting'

  const hasRead = readTools.length > 0
  const readingActive = running && readTools.some(tool => isActiveState(tool.state))
  const hasPlanWrite = planWriteTools.some(tool => isDoneState(tool.state))
  const planWritingActive = planWriteTools.some(tool => isActiveState(tool.state))
  const exitPlanActive =
    exitPlanPermission || exitPlanTools.some(tool => isActiveState(tool.state))
  const exitPlanDone = exitPlanTools.some(tool => isDoneState(tool.state))

  const steps: PlanProgressStep[] = [
    {
      label: '进入 Plan 模式',
      description: '已切换到先规划、后执行的 Claude Code 模式',
      done: planModeSeen,
      active: planModeSeen && !hasRead && !running,
    },
    {
      label: '读取上下文与相关文件',
      description: '模型正在用只读工具理解代码与需求',
      done: hasRead,
      active: readingActive || (running && !hasRead),
    },
    {
      label: '写入或更新计划文件',
      description: '等待 Claude Code 将计划写入 plan file',
      done: hasPlanWrite || exitPlanActive || exitPlanDone,
      active: planWritingActive,
    },
    {
      label: '提交计划等待批准',
      description: '调用 ExitPlanMode 后展示计划审批',
      done: exitPlanDone && session.mode !== 'plan',
      active: exitPlanActive || (session.mode === 'plan' && hasPlanWrite && !exitPlanDone),
    },
  ]

  const activeIndex = steps.findIndex(step => step.active)
  const firstIncompleteIndex = steps.findIndex(step => !step.done)
  const index =
    activeIndex >= 0
      ? activeIndex
      : firstIncompleteIndex >= 0
        ? firstIncompleteIndex
        : steps.length - 1

  return {
    visible: planModeSeen,
    currentStep: index + 1,
    totalSteps: steps.length,
    steps,
  }
}

export function PlanProgressOverlay({
  session,
  defaultOpen = false,
}: {
  session: RendererSession
  defaultOpen?: boolean
}): React.ReactNode {
  const progress = derivePlanProgress(session)
  const [open, setOpen] = useState(defaultOpen)
  if (!progress.visible) return null

  return (
    <div className="plan-progress-float">
      {open ? (
        <div className="plan-progress-card" role="status" aria-live="polite">
          {progress.steps.map((step, index) => (
            <div
              key={step.label}
              className={
                step.done
                  ? 'plan-progress-step is-done'
                  : step.active
                    ? 'plan-progress-step is-active'
                    : 'plan-progress-step'
              }
            >
              <span className="plan-progress-dot" aria-hidden="true" />
              <span>
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </span>
              <em>{index + 1}</em>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="plan-progress-pill"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true" />
        第 {progress.currentStep} / {progress.totalSteps} 步
      </button>
    </div>
  )
}
