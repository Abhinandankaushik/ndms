'use client';

import { Plus, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface TagListInputProps {
  label: string;
  hint?: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Returns the stored form of a tag, or null when the text cannot be one. */
  normalize: (raw: string) => string | null;
  invalidMessage: string;
  maxItems: number;
  maxLength: number;
  suggestions?: readonly string[];
  formatTag?: (value: string) => string;
  placeholder?: string;
  disabled?: boolean;
}

export function TagListInput({
  label,
  hint,
  values,
  onChange,
  normalize,
  invalidMessage,
  maxItems,
  maxLength,
  suggestions = [],
  formatTag = (value) => value,
  placeholder,
  disabled = false,
}: TagListInputProps) {
  const inputId = useId();
  const messageId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isFull = values.length >= maxItems;

  const includes = (value: string) => values.some((existing) => existing.toLowerCase() === value.toLowerCase());

  const add = (raw: string) => {
    if (raw.trim() === '') return;
    const value = normalize(raw);
    if (value === null) {
      setError(invalidMessage);
      return;
    }
    setError(null);
    setText('');
    if (!includes(value) && !isFull) onChange([...values, value]);
  };

  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add(text);
  };

  const remainingSuggestions = suggestions.flatMap((suggestion) => {
    const value = normalize(suggestion);
    return value !== null && !includes(value) ? [value] : [];
  });
  const message = error ?? (isFull ? `Up to ${maxItems} can be added.` : hint);

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      {values.length > 0 && (
        <ul aria-label={label} className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li key={value} className="max-w-full">
              <Badge variant="secondary" className="h-9 max-w-full gap-1 pr-1 pl-3 text-sm font-normal">
                <span className="truncate">{formatTag(value)}</span>
                <button
                  type="button"
                  className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
                  aria-label={`Remove ${formatTag(value)}`}
                  disabled={disabled}
                  onClick={() => onChange(values.filter((existing) => existing !== value))}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={inputId}
          className="h-10 min-w-0 flex-1"
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled || isFull}
          aria-invalid={error !== null}
          aria-describedby={message ? messageId : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          onKeyDown={addOnEnter}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={disabled || isFull || text.trim() === ''}
          onClick={() => add(text)}
        >
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      {message && (
        <p id={messageId} className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {message}
        </p>
      )}
      {remainingSuggestions.length > 0 && !isFull && (
        <div className="flex flex-wrap gap-2">
          {remainingSuggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="ghost"
              size="sm"
              className="border border-dashed"
              disabled={disabled}
              onClick={() => onChange([...values, suggestion])}
            >
              <Plus aria-hidden />
              {formatTag(suggestion)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
