import { useState, useEffect } from 'react';
import { fetchDwp, updateDwp, fetchGitHistory, browseDirectory, type WayPointDetail, type GitCommitEntry, type DirEntry } from '../../api/client';
import { statusOptions, getStatusLabel, getStatusColor } from '../../data/status-labels';
import type { Tab } from '../../App';
import { Diamond, FolderOpen, Folder, CaretDown, CaretRight } from '@phosphor-icons/react';

interface DataWayPointEditorProps {
  projectRoot: string;
  address: string;
  onOpenTab?: (tab: Tab) => void;
}

const s = {
  section: { marginBottom: 20 } as React.CSSProperties,
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8, borderBottom: '1px solid var(--border-light)', paddingBottom: 4,
  } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' } as React.CSSProperties,
  headerBtns: { display: 'flex', gap: 4 } as React.CSSProperties,
  btn: {
    padding: '2px 8px', border: '1px solid var(--border-medium)', borderRadius: 3,
    background: 'var(--bg-surface)', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)',
  } as React.CSSProperties,
  btnPrimary: {
    padding: '2px 8px', border: '1px solid var(--accent-primary)', borderRadius: 3,
    background: 'var(--accent-bg)', fontSize: 11, cursor: 'pointer', color: 'var(--accent-primary)', fontWeight: 600,
  } as React.CSSProperties,
  btnDanger: {
    padding: '2px 8px', border: '1px solid var(--status-error)', borderRadius: 3,
    background: '#b54a3f10', fontSize: 11, cursor: 'pointer', color: 'var(--status-error)',
  } as React.CSSProperties,
  label: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } as React.CSSProperties,
  value: { fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 } as React.CSSProperties,
  link: { fontSize: 13, color: 'var(--accent-primary)', cursor: 'pointer', textDecoration: 'underline' } as React.CSSProperties,
  input: {
    width: '100%', padding: '4px 8px', border: '1px solid var(--border-medium)', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
  } as React.CSSProperties,
  inputSm: {
    padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 3,
    fontSize: 12, fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
  } as React.CSSProperties,
  textarea: {
    width: '100%', padding: '6px 8px', border: '1px solid var(--border-medium)', borderRadius: 4,
    fontSize: 13, fontFamily: 'inherit', background: 'var(--bg-surface)', color: 'var(--text-primary)',
    outline: 'none', resize: 'vertical' as const, minHeight: 60,
  } as React.CSSProperties,
  select: {
    padding: '3px 6px', border: '1px solid var(--border-medium)', borderRadius: 3,
    fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
  } as React.CSSProperties,
  badge: (color: string) => ({
    fontSize: 11, padding: '1px 8px', background: color + '20', color, borderRadius: 3, fontWeight: 600, display: 'inline-block',
  }) as React.CSSProperties,
  empty: { fontSize: 12, color: 'var(--text-muted)', padding: '4px 0', fontStyle: 'italic' as const } as React.CSSProperties,
};

export default function DataWayPointEditor({ projectRoot, address, onOpenTab }: DataWayPointEditorProps) {
  const [data, setData] = useState<WayPointDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit modes
  const [editIdentity, setEditIdentity] = useState(false);
  const [editComment, setEditComment] = useState(false);
  const [editCodeMap, setEditCodeMap] = useState(false);
  const [editTables, setEditTables] = useState(false);

  // Edit buffers
  const [editStatus, setEditStatus] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editSyncedAt, setEditSyncedAt] = useState('');
  const [editCommentText, setEditCommentText] = useState('');

  // CODE_MAP editing
  const [codeMapScopes, setCodeMapScopes] = useState<string[]>([]);
  const [newScope, setNewScope] = useState('');
  const [showDirBrowser, setShowDirBrowser] = useState(false);
  const [dirBrowserPath, setDirBrowserPath] = useState('');
  const [dirBrowserParent, setDirBrowserParent] = useState<string | null>(null);
  const [dirBrowserEntries, setDirBrowserEntries] = useState<DirEntry[]>([]);
  const [dirBrowserLoading, setDirBrowserLoading] = useState(false);

  // TABLES editing
  const [tables, setTables] = useState<{ name: string; items: string[] }[]>([]);
  const [newTableName, setNewTableName] = useState('');
  const [newItemInputs, setNewItemInputs] = useState<Record<number, string>>({});

  // ATTACHMENTS editing
  const [attachments, setAttachments] = useState<string[]>([]);
  const [editAttachments, setEditAttachments] = useState(false);
  const [newAttachment, setNewAttachment] = useState('');
  const [editingAttachmentIdx, setEditingAttachmentIdx] = useState<number | null>(null);
  const [editAttachmentText, setEditAttachmentText] = useState('');

  // ISSUE editing
  const [issues, setIssues] = useState<string[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [editingIssue, setEditingIssue] = useState<number | null>(null);
  const [editIssueText, setEditIssueText] = useState('');
  const [newIssue, setNewIssue] = useState('');

  // OPEN_QUESTIONS editing
  const [openQuestions, setOpenQuestions] = useState<{ id: string; text: string; resolved: boolean }[]>([]);
  const [newOqText, setNewOqText] = useState('');

  // Git History
  const [gitHistory, setGitHistory] = useState<GitCommitEntry[]>([]);
  const [gitExpanded, setGitExpanded] = useState(false);
  const [gitLoading, setGitLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDwp(projectRoot, address)
      .then(d => {
        setData(d);
        setIssues([...d.issues]);
        setOpenQuestions(d.openQuestions.map(q => ({ ...q })));
        setCodeMapScopes([...(d.codeMapScopes || [])]);
        setTables((d.tables || []).map(t => ({ name: t.name, items: [...t.items] })));
        setAttachments([...(d.attachments || [])]);
      })
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
    setGitLoading(true);
    fetchGitHistory(projectRoot, address)
      .then(setGitHistory)
      .catch(() => setGitHistory([]))
      .finally(() => setGitLoading(false));
  }, [projectRoot, address]);

  const saveToServer = async (patch: Partial<WayPointDetail>, skipHistory = false) => {
    if (!data) return;
    setSaving(true);
    try {
      const payload: WayPointDetail = { ...data, ...patch };
      const updated = await updateDwp(projectRoot, payload, skipHistory);
      setData(updated);
      setIssues([...updated.issues]);
      setOpenQuestions(updated.openQuestions.map(q => ({ ...q })));
      setCodeMapScopes([...(updated.codeMapScopes || [])]);
      setTables((updated.tables || []).map(t => ({ name: t.name, items: [...t.items] })));
      setAttachments([...(updated.attachments || [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const navigateTo = (addr: string) => {
    if (!onOpenTab || !addr) return;
    let type: Tab['type'] = 'waypoint';
    if (addr.startsWith('M://')) type = 'map';
    else if (addr.startsWith('D://')) type = 'dwp';
    onOpenTab({ id: addr, title: addr.split('/').pop() || addr, type, address: addr });
  };

  const openDirBrowser = async () => {
    setShowDirBrowser(true);
    setDirBrowserLoading(true);
    try {
      const res = await browseDirectory(projectRoot);
      setDirBrowserPath(res.path);
      setDirBrowserParent(null);
      setDirBrowserEntries(res.entries);
    } catch { /* ignore */ }
    finally { setDirBrowserLoading(false); }
  };

  const browseDirTo = async (path: string) => {
    setDirBrowserLoading(true);
    try {
      const res = await browseDirectory(path);
      setDirBrowserPath(res.path);
      setDirBrowserParent(res.parent && res.path !== projectRoot ? res.parent : null);
      setDirBrowserEntries(res.entries);
    } catch { /* ignore */ }
    finally { setDirBrowserLoading(false); }
  };

  const selectDirAsScope = () => {
    if (!dirBrowserPath) return;
    let relative = dirBrowserPath.replace(/\\/g, '/');
    const root = projectRoot.replace(/\\/g, '/');
    if (relative.startsWith(root)) {
      relative = relative.substring(root.length);
      if (relative.startsWith('/')) relative = relative.substring(1);
    }
    if (relative && !relative.endsWith('/')) relative += '/';
    if (relative && !codeMapScopes.includes(relative)) {
      setCodeMapScopes([...codeMapScopes, relative]);
    }
    setShowDirBrowser(false);
  };

  // --- ISSUE handlers ---
  const toggleSelectIssue = (idx: number) => {
    setSelectedIssues(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };
  const deleteSelectedIssues = () => {
    const updated = issues.filter((_, i) => !selectedIssues.has(i));
    setIssues(updated);
    setSelectedIssues(new Set());
    saveToServer({ issues: updated });
  };
  const startEditIssueItem = (idx: number) => {
    setEditingIssue(idx);
    setEditIssueText(issues[idx]);
  };
  const saveEditIssueItem = () => {
    if (editingIssue !== null) {
      const updated = issues.map((item, i) => i === editingIssue ? editIssueText : item);
      setIssues(updated);
      setEditingIssue(null);
      saveToServer({ issues: updated });
    }
  };
  const addIssue = () => {
    if (newIssue.trim()) {
      const updated = [...issues, newIssue.trim()];
      setIssues(updated);
      setNewIssue('');
      saveToServer({ issues: updated });
    }
  };

  // --- OPEN_QUESTIONS handlers ---
  const toggleOqResolved = (idx: number) => {
    const updated = openQuestions.map((q, i) => i === idx ? { ...q, resolved: !q.resolved } : q);
    setOpenQuestions(updated);
    saveToServer({ openQuestions: updated });
  };
  const addOpenQuestion = () => {
    if (newOqText.trim()) {
      const nextId = `Q${openQuestions.length + 1}`;
      const updated = [...openQuestions, { id: nextId, text: newOqText.trim(), resolved: false }];
      setOpenQuestions(updated);
      setNewOqText('');
      saveToServer({ openQuestions: updated });
    }
  };

  // --- TABLES handlers ---
  const addTable = () => {
    if (!newTableName.trim()) return;
    setTables([...tables, { name: newTableName.trim(), items: [] }]);
    setNewTableName('');
  };
  const removeTable = (idx: number) => {
    setTables(tables.filter((_, i) => i !== idx));
  };
  const addItemToTable = (tableIdx: number) => {
    const text = (newItemInputs[tableIdx] || '').trim();
    if (!text) return;
    const updated = tables.map((t, i) => i === tableIdx ? { ...t, items: [...t.items, text] } : t);
    setTables(updated);
    setNewItemInputs({ ...newItemInputs, [tableIdx]: '' });
  };
  const removeItemFromTable = (tableIdx: number, itemIdx: number) => {
    const updated = tables.map((t, i) => i === tableIdx ? { ...t, items: t.items.filter((_, j) => j !== itemIdx) } : t);
    setTables(updated);
  };
  const saveTablesEdit = () => {
    saveToServer({ tables });
    setEditTables(false);
  };
  const cancelTablesEdit = () => {
    if (data) setTables((data.tables || []).map(t => ({ name: t.name, items: [...t.items] })));
    setEditTables(false);
    setNewTableName('');
    setNewItemInputs({});
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 12 }}>Loading...</div>;
  if (error || !data) return <div style={{ color: 'var(--status-error)', padding: 12 }}>Error: {error}</div>;

  const color = getStatusColor(data.status);

  const startEditIdentity = () => {
    setEditStatus(data.status);
    setEditSummary(data.summary || '');
    setEditVersion(data.version || '');
    setEditPriority(data.priority || '');
    setEditSyncedAt(data.syncedAt || '');
    setEditIdentity(true);
  };

  return (
    <div style={{ fontSize: 13 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Diamond size={16} weight="fill" color="#3a7ca5" />
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{address.split('/').pop()}</span>
        <span style={s.badge(color)}>{getStatusLabel(data.status)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>DWP</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{address}</span>
        {saving && <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Saving...</span>}
      </div>

      {/* ===== GIT HISTORY ===== */}
      {gitHistory.length > 0 && (
        <div style={{ ...s.section, marginBottom: 12 }}>
          <div
            style={{ ...s.sectionHeader, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setGitExpanded(!gitExpanded)}
          >
            <span style={s.sectionTitle}>
              <span style={{ marginRight: 6, fontSize: 10 }}>{gitExpanded ? <CaretDown size={10} /> : <CaretRight size={10} />}</span>
              GIT HISTORY ({gitHistory.length})
            </span>
            {gitLoading && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>loading...</span>}
          </div>
          {gitExpanded && (
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '2px 6px', fontWeight: 500, width: 140 }}>Date</th>
                    <th style={{ padding: '2px 6px', fontWeight: 500, width: 90 }}>Author</th>
                    <th style={{ padding: '2px 6px', fontWeight: 500 }}>Message</th>
                    <th style={{ padding: '2px 6px', fontWeight: 500, width: 70 }}>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {gitHistory.map(c => (
                    <tr key={c.hash} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.date.substring(0, 19)}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{c.author}</td>
                      <td style={{ padding: '3px 6px', color: 'var(--text-primary)' }}>{c.message}</td>
                      <td style={{ padding: '3px 6px', fontFamily: 'monospace', color: 'var(--accent-primary)', fontSize: 10 }}>{c.hash.substring(0, 7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== IDENTITY ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>IDENTITY</span>
          <div style={s.headerBtns}>
            {editIdentity ? (
              <>
                <button style={s.btnPrimary} onClick={() => { saveToServer({ status: editStatus, summary: editSummary, version: editVersion, priority: editPriority, syncedAt: editSyncedAt }); setEditIdentity(false); }}>Save</button>
                <button style={s.btn} onClick={() => setEditIdentity(false)}>Cancel</button>
              </>
            ) : (
              <button style={s.btn} onClick={startEditIdentity}>Edit</button>
            )}
          </div>
        </div>
        {editIdentity ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={s.label}>Status</div>
              <select style={s.select} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                {statusOptions.map(st => <option key={st} value={st}>{st} - {getStatusLabel(st)}</option>)}
              </select>
            </div>
            <div>
              <div style={s.label}>Summary</div>
              <input style={s.input} value={editSummary} onChange={e => setEditSummary(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}><div style={s.label}>Version</div><input style={s.inputSm} value={editVersion} onChange={e => setEditVersion(e.target.value)} /></div>
              <div style={{ flex: 1 }}><div style={s.label}>Priority</div><input style={s.inputSm} value={editPriority} onChange={e => setEditPriority(e.target.value)} /></div>
              <div style={{ flex: 1 }}><div style={s.label}>SYNCED_AT</div><input style={s.inputSm} type="date" value={editSyncedAt} onChange={e => setEditSyncedAt(e.target.value)} /></div>
            </div>
          </div>
        ) : (
          <>
            <div style={s.label}>Summary</div>
            <div style={s.value}>{data.summary || '-'}</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {data.version && <div><span style={s.label}>Version: </span><span style={{ fontSize: 12 }}>{data.version}</span></div>}
              {data.created && <div><span style={s.label}>Created: </span><span style={{ fontSize: 12 }}>{data.created}</span></div>}
              {data.priority && <div><span style={s.label}>Priority: </span><span style={{ fontSize: 12 }}>{data.priority}</span></div>}
              {data.syncedAt && <div><span style={s.label}>SYNCED_AT: </span><span style={{ fontSize: 12 }}>{data.syncedAt}</span></div>}
            </div>
          </>
        )}
      </div>

      {/* ===== CONNECTIONS (read-only: PARENT + REFERENCE) ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>CONNECTIONS</span>
        </div>
        {data.parent && (
          <div style={{ marginBottom: 4 }}>
            <span style={s.label}>Parent: </span>
            <span style={s.link} onDoubleClick={() => navigateTo(data.parent!)}>{data.parent}</span>
          </div>
        )}
        {data.references.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <span style={s.label}>Reference: </span>
            {data.references.map(r => (
              <span key={r} style={{ ...s.link, marginRight: 8 }} onDoubleClick={() => navigateTo(r)}>{r}</span>
            ))}
          </div>
        )}
        {!data.parent && data.references.length === 0 && (
          <div style={s.empty}>연결 정보 없음</div>
        )}
      </div>

      {/* ===== TABLES ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>TABLES</span>
          <div style={s.headerBtns}>
            {editTables ? (
              <>
                <button style={s.btnPrimary} onClick={saveTablesEdit}>Save</button>
                <button style={s.btn} onClick={cancelTablesEdit}>Cancel</button>
              </>
            ) : (
              <button style={s.btn} onClick={() => setEditTables(true)}>Edit</button>
            )}
          </div>
        </div>

        {editTables ? (
          <div>
            {tables.map((table, ti) => (
              <div key={ti} style={{ marginBottom: 12, border: '1px solid var(--border-light)', borderRadius: 4, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{table.name}</span>
                  <button style={s.btnDanger} onClick={() => removeTable(ti)}>삭제</button>
                </div>
                {table.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, paddingLeft: 8 }}>
                    <span style={{ fontSize: 12, flex: 1, color: 'var(--text-secondary)' }}>{item}</span>
                    <button style={s.btnDanger} onClick={() => removeItemFromTable(ti, ii)}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 4, marginTop: 4, paddingLeft: 8 }}>
                  <input
                    style={{ ...s.inputSm, flex: 1 }}
                    placeholder="요소 추가..."
                    value={newItemInputs[ti] || ''}
                    onChange={e => setNewItemInputs({ ...newItemInputs, [ti]: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') addItemToTable(ti); }}
                  />
                  <button style={s.btnPrimary} onClick={() => addItemToTable(ti)} disabled={!(newItemInputs[ti] || '').trim()}>+ Add</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                style={{ ...s.inputSm, flex: 1 }}
                placeholder="새 테이블 이름..."
                value={newTableName}
                onChange={e => setNewTableName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTable(); }}
              />
              <button style={s.btnPrimary} onClick={addTable} disabled={!newTableName.trim()}>+ 테이블</button>
            </div>
          </div>
        ) : (
          tables.length > 0 ? (
            <div>
              {tables.map((table, ti) => (
                <div key={ti} style={{ marginBottom: 10 }}>
                  {table.name === '__raw__' ? (
                    <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'inherit' }}>
                      {table.items.join('\n')}
                    </pre>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{table.name}</div>
                      {table.items.map((item, ii) => (
                        <div key={ii} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '1px 0 1px 12px' }}>{item}</div>
                      ))}
                      {table.items.length === 0 && <div style={{ ...s.empty, paddingLeft: 12 }}>항목 없음</div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={s.empty}>테이블 없음</div>
          )
        )}
      </div>

      {/* ===== CODE_MAP ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>CODE_MAP</span>
          <div style={s.headerBtns}>
            {editCodeMap ? (
              <>
                <button style={s.btnPrimary} onClick={() => { saveToServer({ codeMapScopes }); setEditCodeMap(false); }}>Save</button>
                <button style={s.btn} onClick={() => { setCodeMapScopes([...(data.codeMapScopes || [])]); setEditCodeMap(false); }}>Cancel</button>
              </>
            ) : (
              <button style={s.btn} onClick={() => setEditCodeMap(true)}>Edit</button>
            )}
          </div>
        </div>
        {editCodeMap ? (
          <div>
            {codeMapScopes.map((scope, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{scope}</span>
                <button style={s.btnDanger} onClick={() => setCodeMapScopes(codeMapScopes.filter((_, j) => j !== i))}>x</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                style={{ ...s.inputSm, flex: 1, fontFamily: 'monospace' }}
                placeholder="scope 경로 추가..."
                value={newScope}
                onChange={e => setNewScope(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newScope.trim()) {
                    setCodeMapScopes([...codeMapScopes, newScope.trim()]);
                    setNewScope('');
                  }
                }}
              />
              <button style={s.btnPrimary} onClick={() => {
                if (newScope.trim()) { setCodeMapScopes([...codeMapScopes, newScope.trim()]); setNewScope(''); }
              }} disabled={!newScope.trim()}>+ Add</button>
              <button style={s.btn} onClick={openDirBrowser}>Browse</button>
            </div>

            {showDirBrowser && (
              <div style={{
                marginTop: 8, border: '1px solid var(--border-medium)', borderRadius: 6,
                background: 'var(--bg-surface)', maxHeight: 250, display: 'flex', flexDirection: 'column',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-tertiary)',
                }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {dirBrowserPath}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button style={s.btnPrimary} onClick={selectDirAsScope}>Select</button>
                    <button style={s.btn} onClick={() => setShowDirBrowser(false)}>Close</button>
                  </div>
                </div>
                <div style={{ overflow: 'auto', flex: 1, maxHeight: 200 }}>
                  {dirBrowserLoading ? (
                    <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)' }}>Loading...</div>
                  ) : (
                    <>
                      {dirBrowserParent && (
                        <div
                          style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => browseDirTo(dirBrowserParent)}
                        >
                          <FolderOpen size={14} /><span style={{ color: 'var(--text-muted)' }}>..</span>
                        </div>
                      )}
                      {dirBrowserEntries.map(entry => (
                        <div
                          key={entry.path}
                          style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                          onClick={() => browseDirTo(entry.path)}
                          onDoubleClick={() => {
                            let relative = entry.path.replace(/\\/g, '/');
                            const root = projectRoot.replace(/\\/g, '/');
                            if (relative.startsWith(root)) {
                              relative = relative.substring(root.length);
                              if (relative.startsWith('/')) relative = relative.substring(1);
                            }
                            if (relative && !relative.endsWith('/')) relative += '/';
                            if (relative && !codeMapScopes.includes(relative)) {
                              setCodeMapScopes([...codeMapScopes, relative]);
                            }
                            setShowDirBrowser(false);
                          }}
                        >
                          {entry.hasChildren ? <FolderOpen size={14} /> : <Folder size={14} />}
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{entry.name}</span>
                        </div>
                      ))}
                      {dirBrowserEntries.length === 0 && (
                        <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)' }}>하위 폴더 없음</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          codeMapScopes.length > 0 ? (
            <div>
              <div style={s.label}>scope:</div>
              {codeMapScopes.map((scope, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', padding: '2px 0 2px 12px' }}>{scope}</div>
              ))}
            </div>
          ) : (
            <div style={s.empty}>CODE_MAP 없음</div>
          )
        )}
      </div>

      {/* ===== ATTACHMENTS ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>ATTACHMENTS</span>
          <div style={s.headerBtns}>
            {editAttachments ? (
              <>
                <button style={s.btnPrimary} onClick={() => {
                  const finalList = editingAttachmentIdx !== null
                    ? attachments.map((a, i) => i === editingAttachmentIdx ? editAttachmentText.trim() : a).filter(a => a)
                    : attachments;
                  setAttachments(finalList);
                  setEditingAttachmentIdx(null);
                  saveToServer({ attachments: finalList });
                  setEditAttachments(false);
                }}>Save</button>
                <button style={s.btn} onClick={() => {
                  setAttachments([...(data?.attachments || [])]);
                  setEditingAttachmentIdx(null);
                  setNewAttachment('');
                  setEditAttachments(false);
                }}>Cancel</button>
              </>
            ) : (
              <button style={s.btn} onClick={() => setEditAttachments(true)}>Edit</button>
            )}
          </div>
        </div>
        {editAttachments ? (
          <div>
            {attachments.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                {editingAttachmentIdx === i ? (
                  <input
                    style={{ ...s.inputSm, flex: 1, fontFamily: 'monospace' }}
                    value={editAttachmentText}
                    autoFocus
                    onChange={e => setEditAttachmentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setAttachments(attachments.map((a, j) => j === i ? editAttachmentText.trim() : a).filter(a => a));
                        setEditingAttachmentIdx(null);
                      } else if (e.key === 'Escape') {
                        setEditingAttachmentIdx(null);
                      }
                    }}
                  />
                ) : (
                  <span
                    style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', flex: 1, cursor: 'pointer' }}
                    onClick={() => { setEditingAttachmentIdx(i); setEditAttachmentText(item); }}
                  >{item}</span>
                )}
                <button style={s.btnDanger} onClick={() => {
                  setAttachments(attachments.filter((_, j) => j !== i));
                  if (editingAttachmentIdx === i) setEditingAttachmentIdx(null);
                }}>x</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input
                style={{ ...s.inputSm, flex: 1, fontFamily: 'monospace' }}
                placeholder="URL 추가... (예: https://... 또는 file:///path/to/file.sql)"
                value={newAttachment}
                onChange={e => setNewAttachment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newAttachment.trim()) {
                    setAttachments([...attachments, newAttachment.trim()]);
                    setNewAttachment('');
                  }
                }}
              />
              <button style={s.btnPrimary} onClick={() => {
                if (newAttachment.trim()) { setAttachments([...attachments, newAttachment.trim()]); setNewAttachment(''); }
              }} disabled={!newAttachment.trim()}>+ Add</button>
            </div>
          </div>
        ) : (
          attachments.length > 0 ? (
            <div>
              {attachments.map((item, i) => {
                const dashIdx = item.indexOf(' — ');
                const url = dashIdx >= 0 ? item.substring(0, dashIdx) : item;
                const desc = dashIdx >= 0 ? item.substring(dashIdx + 3) : null;
                const isHttp = url.startsWith('http://') || url.startsWith('https://');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '2px 0 2px 4px' }}>
                    {isHttp ? (
                      <a href={url} target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent-blue)', wordBreak: 'break-all' }}>{url}</a>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{url}</span>
                    )}
                    {desc && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {desc}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={s.empty}>ATTACHMENTS 없음</div>
          )
        )}
      </div>

      {/* ===== ISSUE ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>ISSUE</span>
          <div style={s.headerBtns}>
            {selectedIssues.size > 0 && (
              <>
                <button style={s.btn} onClick={() => { const idx = [...selectedIssues][0]; startEditIssueItem(idx); }}>Edit</button>
                <button style={s.btnDanger} onClick={deleteSelectedIssues}>Delete ({selectedIssues.size})</button>
              </>
            )}
          </div>
        </div>
        {issues.map((issue, i) => (
          <div key={i} style={{ padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <input type="checkbox" checked={selectedIssues.has(i)} onChange={() => toggleSelectIssue(i)} style={{ marginTop: 2 }} />
            {editingIssue === i ? (
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                <input style={{ ...s.inputSm, flex: 1 }} value={editIssueText} onChange={e => setEditIssueText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEditIssueItem(); if (e.key === 'Escape') setEditingIssue(null); }} autoFocus />
                <button style={s.btnPrimary} onClick={saveEditIssueItem}>OK</button>
              </div>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }} onDoubleClick={() => startEditIssueItem(i)}>{issue}</span>
            )}
          </div>
        ))}
        {issues.length === 0 && <div style={s.empty}>이슈 없음</div>}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <input
            style={{ ...s.inputSm, flex: 1 }}
            placeholder="새 이슈 추가..."
            value={newIssue}
            onChange={e => setNewIssue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addIssue(); }}
          />
          <button style={s.btnPrimary} onClick={addIssue} disabled={!newIssue.trim()}>+ Add</button>
        </div>
      </div>

      {/* ===== OPEN_QUESTIONS ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>OPEN_QUESTIONS</span>
        </div>
        {openQuestions.map((q, i) => (
          <div key={q.id} style={{ padding: '4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ ...s.badge(q.resolved ? '#5a8a5e' : '#c47f17'), cursor: 'pointer' }}
              onClick={() => toggleOqResolved(i)}
              title="클릭하여 상태 전환"
            >
              {q.resolved ? 'RESOLVED' : 'OPEN'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>[{q.id}]</span>
            <span>{q.text}</span>
          </div>
        ))}
        {openQuestions.length === 0 && <div style={s.empty}>미결 질문 없음</div>}
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <input
            style={{ ...s.inputSm, flex: 1 }}
            placeholder="새 질문 추가..."
            value={newOqText}
            onChange={e => setNewOqText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addOpenQuestion(); }}
          />
          <button style={s.btnPrimary} onClick={addOpenQuestion} disabled={!newOqText.trim()}>+ Add</button>
        </div>
      </div>

      {/* ===== COMMENT ===== */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>COMMENT</span>
          <div style={s.headerBtns}>
            {editComment ? (
              <>
                <button style={s.btnPrimary} onClick={() => { saveToServer({ comment: editCommentText || null }); setEditComment(false); }}>Save</button>
                <button style={s.btn} onClick={() => setEditComment(false)}>Cancel</button>
              </>
            ) : (
              <button style={s.btn} onClick={() => { setEditCommentText(data.comment || ''); setEditComment(true); }}>Edit</button>
            )}
          </div>
        </div>
        {editComment ? (
          <textarea style={s.textarea} value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={4} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {data.comment || <span style={s.empty}>코멘트 없음</span>}
          </div>
        )}
      </div>
    </div>
  );
}
