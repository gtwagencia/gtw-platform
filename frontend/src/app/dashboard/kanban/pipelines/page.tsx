'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Pipeline, PipelineStage, Inbox } from '@/types';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Save, X,
  AlertCircle, Check, Star, Layers,
} from 'lucide-react';
import clsx from 'clsx';

interface Department {
  id: string;
  name: string;
  color: string;
}

interface StageFormState {
  id?: string;
  name: string;
  color: string;
  isDefault: boolean;
  aiPrompt: string;
  isNew?: boolean;
}

interface PipelineFormState {
  name: string;
  description: string;
  isDefault: boolean;
  inboxIds: string[];
  departmentIds: string[];
  stages: StageFormState[];
}

const PRESET_COLORS = [
  '#6366f1', '#f97316', '#eab308', '#22c55e', '#ef4444',
  '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={clsx(
            'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
            value === c ? 'border-gray-900 scale-110' : 'border-transparent'
          )}
          style={{ backgroundColor: c }}
        />
      ))}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input w-24 text-xs font-mono"
        placeholder="#6366f1"
      />
    </div>
  );
}

function StageRow({
  stage,
  onChange,
  onDelete,
  canDelete,
}: {
  stage: StageFormState;
  onChange: (s: StageFormState) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-white">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: stage.color }}
        />
        <input
          type="text"
          value={stage.name}
          onChange={e => onChange({ ...stage, name: e.target.value })}
          className="input flex-1 text-sm"
          placeholder="Nome da etapa"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={stage.isDefault}
            onChange={e => onChange({ ...stage, isDefault: e.target.checked })}
            className="rounded"
          />
          Padrão
        </label>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-gray-400 hover:text-gray-600"
          title="Expandir"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500"
            title="Remover etapa"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cor</label>
            <ColorPicker value={stage.color} onChange={c => onChange({ ...stage, color: c })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Prompt de IA (opcional)
            </label>
            <textarea
              value={stage.aiPrompt}
              onChange={e => onChange({ ...stage, aiPrompt: e.target.value })}
              rows={3}
              className="input w-full text-xs resize-none"
              placeholder="Contexto adicional para análise de IA nesta etapa..."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  pipeline,
  inboxes,
  departments,
  onSaved,
  onDeleted,
  workspaceId,
}: {
  pipeline: Pipeline;
  inboxes: Inbox[];
  departments: Department[];
  onSaved: (p: Pipeline) => void;
  onDeleted: (id: string) => void;
  workspaceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<PipelineFormState>({
    name: pipeline.name,
    description: pipeline.description || '',
    isDefault: pipeline.is_default,
    inboxIds: pipeline.inbox_ids || [],
    departmentIds: pipeline.department_ids || [],
    stages: (pipeline.stages || []).map(s => ({
      id: s.id,
      name: s.name,
      color: s.color,
      isDefault: s.is_default,
      aiPrompt: s.ai_prompt || '',
    })),
  });

  function addStage() {
    setForm(f => ({
      ...f,
      stages: [
        ...f.stages,
        { name: '', color: '#6366f1', isDefault: false, aiPrompt: '', isNew: true },
      ],
    }));
  }

  function updateStage(idx: number, s: StageFormState) {
    setForm(f => {
      const stages = [...f.stages];
      stages[idx] = s;
      return { ...f, stages };
    });
  }

  function removeStage(idx: number) {
    setForm(f => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }));
  }

  function toggleInbox(id: string) {
    setForm(f => ({
      ...f,
      inboxIds: f.inboxIds.includes(id)
        ? f.inboxIds.filter(x => x !== id)
        : [...f.inboxIds, id],
    }));
  }

  function toggleDept(id: string) {
    setForm(f => ({
      ...f,
      departmentIds: f.departmentIds.includes(id)
        ? f.departmentIds.filter(x => x !== id)
        : [...f.departmentIds, id],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError(null);
    try {
      // Update pipeline meta
      const { data: updated } = await api.put<Pipeline>(
        `/workspaces/${workspaceId}/pipelines/${pipeline.id}`,
        {
          name: form.name,
          description: form.description || null,
          isDefault: form.isDefault,
          inboxIds: form.inboxIds,
          departmentIds: form.departmentIds,
        }
      );

      // Sync stages: update existing, create new
      const existingIds = new Set(pipeline.stages.map(s => s.id));
      const keptIds     = new Set(form.stages.filter(s => s.id).map(s => s.id!));

      // Delete removed stages
      for (const s of pipeline.stages) {
        if (!keptIds.has(s.id)) {
          await api.delete(`/workspaces/${workspaceId}/pipelines/${pipeline.id}/stages/${s.id}`);
        }
      }

      // Update / create stages
      for (const s of form.stages) {
        if (s.id && existingIds.has(s.id)) {
          await api.put(`/workspaces/${workspaceId}/pipelines/${pipeline.id}/stages/${s.id}`, {
            name: s.name, color: s.color, isDefault: s.isDefault, aiPrompt: s.aiPrompt || null,
          });
        } else {
          await api.post(`/workspaces/${workspaceId}/pipelines/${pipeline.id}/stages`, {
            name: s.name, color: s.color, isDefault: s.isDefault, aiPrompt: s.aiPrompt || null,
          });
        }
      }

      // Refetch updated pipeline
      const { data: fresh } = await api.get<Pipeline>(
        `/workspaces/${workspaceId}/pipelines/${pipeline.id}`
      );
      onSaved(fresh);
      setExpanded(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${workspaceId}/pipelines/${pipeline.id}`);
      onDeleted(pipeline.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao excluir');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
          <Layers className="w-4 h-4 text-brand-500 flex-shrink-0" />
          <span className="font-semibold text-gray-900 truncate">{pipeline.name}</span>
          {pipeline.is_default && (
            <span className="flex items-center gap-1 text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full flex-shrink-0">
              <Star className="w-3 h-3" /> Padrão
            </span>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {pipeline.stages.length} etapas
          </span>
        </button>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Excluir funil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600">Confirmar?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="p-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="input w-full"
                placeholder="Opcional"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
              className="rounded"
            />
            Funil padrão (usado quando inbox não tem funil específico)
          </label>

          {/* Inboxes */}
          {inboxes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Inboxes vinculados</label>
              <div className="flex flex-wrap gap-2">
                {inboxes.map(inbox => (
                  <button
                    key={inbox.id}
                    type="button"
                    onClick={() => toggleInbox(inbox.id)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      form.inboxIds.includes(inbox.id)
                        ? 'bg-brand-100 border-brand-300 text-brand-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    {inbox.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Departments */}
          {departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departamentos vinculados</label>
              <div className="flex flex-wrap gap-2">
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => toggleDept(dept.id)}
                    className={clsx(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      form.departmentIds.includes(dept.id)
                        ? 'bg-brand-100 border-brand-300 text-brand-700'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    )}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1"
                      style={{ backgroundColor: dept.color }}
                    />
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stages */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Etapas</label>
              <button
                type="button"
                onClick={addStage}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar etapa
              </button>
            </div>
            <div className="space-y-2">
              {form.stages.map((stage, idx) => (
                <StageRow
                  key={stage.id || `new-${idx}`}
                  stage={stage}
                  onChange={s => updateStage(idx, s)}
                  onDelete={() => removeStage(idx)}
                  canDelete={form.stages.length > 1}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="btn-secondary text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saving ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPipelineForm({
  inboxes,
  departments,
  workspaceId,
  onCreated,
  onCancel,
}: {
  inboxes: Inbox[];
  departments: Department[];
  workspaceId: string;
  onCreated: (p: Pipeline) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<PipelineFormState>({
    name: '',
    description: '',
    isDefault: false,
    inboxIds: [],
    departmentIds: [],
    stages: [],
  });

  function addStage() {
    setForm(f => ({
      ...f,
      stages: [
        ...f.stages,
        { name: '', color: '#6366f1', isDefault: f.stages.length === 0, aiPrompt: '', isNew: true },
      ],
    }));
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<Pipeline>(`/workspaces/${workspaceId}/pipelines`, {
        name: form.name,
        description: form.description || null,
        isDefault: form.isDefault,
        inboxIds: form.inboxIds,
        departmentIds: form.departmentIds,
        stages: form.stages.length > 0
          ? form.stages.map(s => ({
              name: s.name, color: s.color, is_default: s.isDefault, ai_prompt: s.aiPrompt || null,
            }))
          : undefined,
      });
      onCreated(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao criar funil');
      setSaving(false);
    }
  }

  return (
    <div className="card border-2 border-brand-200">
      <h3 className="font-semibold text-gray-900 mb-4">Novo Funil</h3>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input w-full"
              placeholder="Ex: Vendas, Pós-venda, Suporte..."
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="input w-full"
              placeholder="Opcional"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
            className="rounded"
          />
          Funil padrão
        </label>

        {inboxes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Inboxes vinculados</label>
            <div className="flex flex-wrap gap-2">
              {inboxes.map(inbox => (
                <button
                  key={inbox.id}
                  type="button"
                  onClick={() =>
                    setForm(f => ({
                      ...f,
                      inboxIds: f.inboxIds.includes(inbox.id)
                        ? f.inboxIds.filter(x => x !== inbox.id)
                        : [...f.inboxIds, inbox.id],
                    }))
                  }
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    form.inboxIds.includes(inbox.id)
                      ? 'bg-brand-100 border-brand-300 text-brand-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {inbox.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {departments.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Departamentos vinculados</label>
            <div className="flex flex-wrap gap-2">
              {departments.map(dept => (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() =>
                    setForm(f => ({
                      ...f,
                      departmentIds: f.departmentIds.includes(dept.id)
                        ? f.departmentIds.filter(x => x !== dept.id)
                        : [...f.departmentIds, dept.id],
                    }))
                  }
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    form.departmentIds.includes(dept.id)
                      ? 'bg-brand-100 border-brand-300 text-brand-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: dept.color }}
                  />
                  {dept.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Etapas
              <span className="text-gray-400 font-normal ml-1">(deixe vazio para usar etapas padrão)</span>
            </label>
            <button
              type="button"
              onClick={addStage}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar etapa
            </button>
          </div>
          {form.stages.length > 0 && (
            <div className="space-y-2">
              {form.stages.map((stage, idx) => (
                <StageRow
                  key={`new-${idx}`}
                  stage={stage}
                  onChange={s => {
                    const stages = [...form.stages];
                    stages[idx] = s;
                    setForm(f => ({ ...f, stages }));
                  }}
                  onDelete={() => setForm(f => ({ ...f, stages: f.stages.filter((_, i) => i !== idx) }))}
                  canDelete={form.stages.length > 1}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button type="button" onClick={onCancel} className="btn-secondary text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Criar Funil
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PipelinesPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();

  const [pipelines,    setPipelines]    = useState<Pipeline[]>([]);
  const [inboxes,      setInboxes]      = useState<Inbox[]>([]);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showNewForm,  setShowNewForm]  = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    const [pRes, iRes, dRes] = await Promise.all([
      api.get<Pipeline[]>(`/workspaces/${currentWorkspace.id}/pipelines`),
      api.get<Inbox[]>(`/workspaces/${currentWorkspace.id}/inboxes`),
      api.get<Department[]>(`/workspaces/${currentWorkspace.id}/departments`),
    ]);
    setPipelines(pRes.data);
    setInboxes(iRes.data);
    setDepartments(dRes.data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated: Pipeline) {
    setPipelines(ps => ps.map(p => (p.id === updated.id ? updated : p)));
  }

  function handleDeleted(id: string) {
    setPipelines(ps => ps.filter(p => p.id !== id));
  }

  function handleCreated(created: Pipeline) {
    setPipelines(ps => [...ps, created]);
    setShowNewForm(false);
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Gerenciar Funis" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Gerenciar Funis"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/kanban')}
              className="btn-secondary text-sm"
            >
              Voltar ao Kanban
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo Funil
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {showNewForm && (
              <NewPipelineForm
                inboxes={inboxes}
                departments={departments}
                workspaceId={currentWorkspace.id}
                onCreated={handleCreated}
                onCancel={() => setShowNewForm(false)}
              />
            )}

            {pipelines.length === 0 && !showNewForm ? (
              <div className="card text-center py-12">
                <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">Nenhum funil criado ainda.</p>
                <button
                  onClick={() => setShowNewForm(true)}
                  className="btn-primary text-sm inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Criar primeiro funil
                </button>
              </div>
            ) : (
              pipelines.map(pipeline => (
                <PipelineCard
                  key={pipeline.id}
                  pipeline={pipeline}
                  inboxes={inboxes}
                  departments={departments}
                  onSaved={handleSaved}
                  onDeleted={handleDeleted}
                  workspaceId={currentWorkspace.id}
                />
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
