import { supabase } from './supabase'

// Clarification questions, client side (PRD "Context & AI Editing" §5).
//
// EVERY WORD A USER READS IS IN THIS FILE. The model supplies a `type` from a closed enum
// and a handful of slot values; the sentence around them is ours. That is not a style
// choice — a question carries our authority and the user will tap the default, so a
// recording able to inject an arbitrary question would be a phishing vector (§7 control 3).
// The worker's clarify.py drops anything that fails the enum before it is stored; this file
// is the second half of the same rule, and the reason it can be: a template with holes
// cannot be talked into saying something else.
//
// The slots are rendered as ordinary React children, so React escapes them. Do not
// introduce dangerouslySetInnerHTML here for any reason.

export const CLARIFICATION_NOTE_MAX = 600

export type ClarificationType =
  | 'variable_value'
  | 'flow_split'
  | 'element_name'
  | 'missing_prerequisite'

export type ClarificationOption = { id: string; label: string }

export type Clarification = {
  type: ClarificationType
  evidence: { timestamp: string; step_index: number }
  slots: Record<string, string>
  options: ClarificationOption[]
  default_option_id: string
}

// What the chip above the question says. Evidence is what makes a question feel earned
// rather than generic (PRD §2.2) — "we asked because of this, at this moment".
const EVIDENCE: Record<ClarificationType, (s: Record<string, string>) => string> = {
  variable_value: (s) => `Typed into “${s.field_label ?? 'a field'}”`,
  flow_split: () => 'The recording changes tack here',
  element_name: (s) => `A control I couldn’t read: ${s.element_description ?? 'unlabelled'}`,
  missing_prerequisite: () => 'The recording starts part-way in',
}

// THE QUESTIONS. Written to be answered in a tap, in the second person, stating what turns
// on the answer. v3 prototype tone: warmer and shorter than v2.
const QUESTION: Record<ClarificationType, (s: Record<string, string>) => string> = {
  variable_value: (s) =>
    `Should readers type “${s.typed_value ?? 'that value'}” too, or their own?`,
  flow_split: (s) =>
    `This looks like two things: ${s.first_task ?? 'the first part'}, then ${
      s.second_task ?? 'the second'
    }. One guide, or two?`,
  element_name: (s) => `What is ${s.element_description ?? 'that control'} called?`,
  missing_prerequisite: (s) =>
    `Readers won’t start where you did — ${
      s.prerequisite ?? 'some set-up was already done'
    }. Mention it?`,
}

// What happens if they skip. Every question is already answered before it is asked
// (PRD §2.5), and the card says so out loud rather than leaving them to guess.
const FALLBACK: Record<ClarificationType, string> = {
  variable_value: 'I’ll treat it as their own value.',
  flow_split: 'I’ll keep it as one guide.',
  element_name: 'I’ll describe it by what it does.',
  missing_prerequisite: 'I’ll leave it out.',
}

export const evidenceFor = (c: Clarification) => EVIDENCE[c.type](c.slots ?? {})
export const questionFor = (c: Clarification) => QUESTION[c.type](c.slots ?? {})
export const fallbackFor = (c: Clarification) => FALLBACK[c.type]

// The one type where the honest answer may be a name we never offered. Everything else is
// a closed choice, so a free-text box on it would be a blank field asking for composition —
// the thing PRD §2.3 says users cannot do.
export const acceptsFreeText = (c: Clarification) => c.type === 'element_name'

export const defaultOption = (c: Clarification): ClarificationOption | null =>
  c.options.find((o) => o.id === c.default_option_id) ?? c.options[0] ?? null

// The label to show for an answer already given, in the answered list above the open
// question. A free-text answer shows as itself.
export function answerLabel(c: Clarification, value: string): string {
  return c.options.find((o) => o.id === value)?.label ?? value
}

/**
 * Release the write stage.
 *
 * Returns true when this call did it, false when the job had already been released —
 * a double tap, or a second tab. NOT an error either way: the answer to "did anything go
 * wrong?" is no, and the caller carries on identically.
 *
 * Every answer is re-checked server-side against the option ids the stored question
 * offered (migration 0043). Nothing here is a security boundary; it is the shape of the
 * request.
 */
export async function submitClarificationAnswers(
  jobId: string,
  answers: Record<string, string>,
  note: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('submit_clarification_answers', {
    p_job_id: jobId,
    p_answers: answers,
    p_note: note.slice(0, CLARIFICATION_NOTE_MAX),
  })
  if (error) throw error
  return data === true
}

// Questions that never got asked during the run, or were skipped. Same validated shape,
// carried on the article so the editor can offer them later (PRD §5.4).
export async function clearOpenClarifications(articleId: string): Promise<void> {
  await supabase.from('articles').update({ open_clarifications: null }).eq('id', articleId)
}
