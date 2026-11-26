'use client';
import { useActionState, useState } from 'react';
import type { EntityFormState } from '@/app/(dashboard)/catat/actions';
import type { FieldDef, FormValues } from '@/lib/entities/registry';

type Props = {
  action: (prev: EntityFormState, fd: FormData) => Promise<EntityFormState>;
  fields: FieldDef[];
  options: Record<string, { value: string; label: string }[]>;
  values: FormValues;
  id?: string;
  back: string;
  submitLabel: string;
};

function asString(v: FormValues[string] | undefined): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** Formulir generik dari definisi field (lib/entities/registry.ts). */
export function EntityForm({ action, fields, options, values, id, back, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<EntityFormState, FormData>(action, { ok: false });
  const [ranges, setRanges] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.filter((f) => f.type === 'range').map((f) => [f.name, asString(values[f.name]) || '0'])));
  const err = (name: string) => state.fieldErrors?.[name] && <span id={`${name}-err`} className="mt-1 block text-[12px] text-negative">{state.fieldErrors[name]}</span>;
  const describedBy = (f: FieldDef) => [state.fieldErrors?.[f.name] ? `${f.name}-err` : '', f.hint ? `${f.name}-hint` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="back" value={back} />
      {fields.map((f) => {
        const common = { id: f.name, name: f.name, 'aria-invalid': !!state.fieldErrors?.[f.name], 'aria-describedby': describedBy(f) };
        const span = f.half ? '' : 'sm:col-span-2';
        if (f.type === 'checkbox') {
          return (
            <label key={f.name} className={`flex min-h-11 items-center gap-3 text-[14px] ${span}`}>
              <input type="checkbox" {...common} defaultChecked={values[f.name] === true} className="h-5 w-5 accent-[var(--accent)]" />
              {f.label}
            </label>
          );
        }
        const label = <span className="label">{f.label}{f.required ? '' : <span className="font-normal"> (opsional)</span>}</span>;
        const hint = f.hint && <span id={`${f.name}-hint`} className="mt-1 block text-[12px] text-muted">{f.hint}</span>;
        let control;
        if (f.type === 'select') {
          const list = f.options ?? options[f.source ?? ''] ?? [];
          control = (
            <select {...common} className="input" defaultValue={asString(values[f.name])} required={f.required}>
              {(!f.required || !values[f.name]) && (f.emptyLabel || !f.options) && <option value="">{f.emptyLabel ?? 'Pilih'}</option>}
              {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        } else if (f.type === 'textarea') {
          control = <textarea {...common} className="input min-h-24 py-2.5" defaultValue={asString(values[f.name])} placeholder={f.placeholder} />;
        } else if (f.type === 'range') {
          control = (
            <span className="flex items-center gap-3">
              <input type="range" {...common} min={f.min} max={f.max} step={5} value={ranges[f.name]} onChange={(e) => setRanges((r) => ({ ...r, [f.name]: e.target.value }))}
                className="h-11 flex-1 accent-[var(--accent)]" />
              <span className="num w-12 text-right text-[15px] font-bold" aria-hidden="true">{ranges[f.name]}%</span>
            </span>
          );
        } else {
          const type = { money: 'text', number: 'number', date: 'date', time: 'time', url: 'url', tags: 'text', text: 'text' }[f.type];
          control = (
            <input {...common} type={type} className={`input ${f.type === 'money' || f.type === 'number' ? 'num' : ''}`}
              inputMode={f.type === 'money' ? 'decimal' : f.type === 'number' ? 'numeric' : undefined}
              min={f.min} max={f.max} required={f.required} placeholder={f.placeholder ?? (f.type === 'money' ? '25rb' : undefined)}
              defaultValue={asString(values[f.name])} />
          );
        }
        return <label key={f.name} htmlFor={f.name} className={span}>{label}{control}{hint}{err(f.name)}</label>;
      })}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary min-w-32" disabled={pending}>{pending ? 'Menyimpan...' : submitLabel}</button>
        {!state.ok && state.message && <span role="alert" className="text-[13px] text-negative">{state.message}</span>}
      </div>
    </form>
  );
}
