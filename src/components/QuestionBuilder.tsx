"use client";

import { useState } from "react";

export interface Question {
  id: string;
  question: string;
  type: "text" | "select" | "multi_select" | "yes_no";
  options?: string[];
  required: boolean;
}

interface QuestionBuilderProps {
  questions: Question[];
  onChange: (questions: Question[]) => void;
  maxQuestions?: number;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const TYPE_LABELS: Record<Question["type"], string> = {
  text: "Text",
  select: "Single Select",
  multi_select: "Multi Select",
  yes_no: "Yes / No",
};

export function QuestionBuilder({
  questions,
  onChange,
  maxQuestions = 5,
}: QuestionBuilderProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const addQuestion = () => {
    if (questions.length >= maxQuestions) return;
    onChange([
      ...questions,
      { id: generateId(), question: "", type: "text", required: false },
    ]);
  };

  const removeQuestion = (idx: number) => {
    onChange(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, updates: Partial<Question>) => {
    onChange(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  };

  const addOption = (idx: number) => {
    const q = questions[idx];
    const opts = q.options || [];
    if (opts.length >= 10) return;
    updateQuestion(idx, { options: [...opts, ""] });
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    const q = questions[qIdx];
    const opts = [...(q.options || [])];
    opts[optIdx] = value;
    updateQuestion(qIdx, { options: opts });
  };

  const removeOption = (qIdx: number, optIdx: number) => {
    const q = questions[qIdx];
    const opts = (q.options || []).filter((_, i) => i !== optIdx);
    updateQuestion(qIdx, { options: opts });
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onChange(reordered);
    setDragIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const needsOptions = (type: Question["type"]) =>
    type === "select" || type === "multi_select";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700">
          Custom Questions
        </label>
        <span className="text-xs text-slate-400">
          {questions.length}/{maxQuestions}
        </span>
      </div>

      {questions.map((q, idx) => (
        <div
          key={q.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
          className={`border rounded-xl p-4 space-y-3 transition-colors ${
            dragIdx === idx
              ? "border-blue-400 bg-blue-50/50"
              : "border-slate-200 bg-white"
          }`}
        >
          {/* Header row */}
          <div className="flex items-center gap-2">
            <div className="cursor-grab text-slate-300 hover:text-slate-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 4a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2zM7 10a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2zM7 16a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </div>
            <span className="text-xs text-slate-400 font-medium">Q{idx + 1}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => removeQuestion(idx)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
            >
              Remove
            </button>
          </div>

          {/* Question text */}
          <input
            type="text"
            value={q.question}
            onChange={(e) => updateQuestion(idx, { question: e.target.value })}
            placeholder="Enter your question..."
            maxLength={500}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />

          {/* Type + Required */}
          <div className="flex items-center gap-3">
            <select
              value={q.type}
              onChange={(e) => {
                const type = e.target.value as Question["type"];
                const updates: Partial<Question> = { type };
                if (needsOptions(type) && !q.options?.length) {
                  updates.options = [""];
                }
                if (!needsOptions(type)) {
                  updates.options = undefined;
                }
                updateQuestion(idx, updates);
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
            >
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
              />
              Required
            </label>
          </div>

          {/* Options (for select / multi_select) */}
          {needsOptions(q.type) && (
            <div className="space-y-2 pl-4 border-l-2 border-slate-100">
              {(q.options || []).map((opt, optIdx) => (
                <div key={optIdx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(idx, optIdx, e.target.value)}
                    placeholder={`Option ${optIdx + 1}`}
                    maxLength={200}
                    className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(idx, optIdx)}
                    className="text-slate-300 hover:text-red-400"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {(q.options?.length || 0) < 10 && (
                <button
                  type="button"
                  onClick={() => addOption(idx)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  + Add option
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {questions.length < maxQuestions && (
        <button
          type="button"
          onClick={addQuestion}
          className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 transition-colors"
        >
          + Add Question
        </button>
      )}
    </div>
  );
}
