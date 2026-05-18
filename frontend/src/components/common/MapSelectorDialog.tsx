import { useEffect, useState } from 'react';
import { fetchTree } from '../../api/client';
import type { TreeNode } from '../../types/loadstar';

interface Props {
  projectRoot: string;
  /** 현재 선택된 맵 주소 목록. 빈 배열 = 저장된 선택 없음(전체 선택으로 초기화) */
  selectedMaps: string[];
  onConfirm: (maps: string[]) => void;
}

interface MapEntry {
  address: string;
  depth: number;
  summary: string;
}

/** depth=0(M://root)는 제외하고 하위 MAP만 추출 */
function extractMaps(nodes: TreeNode[], depth = 0, out: MapEntry[] = []): MapEntry[] {
  for (const n of nodes) {
    if (n.type === 'MAP') {
      if (depth > 0) {
        out.push({ address: n.address, depth: depth - 1, summary: n.summary ?? '' });
      }
      extractMaps(n.children, depth + 1, out);
    }
  }
  return out;
}

export default function MapSelectorDialog({ projectRoot, selectedMaps, onConfirm }: Props) {
  const [maps, setMaps] = useState<MapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTree(projectRoot)
      .then(tree => {
        const extracted = extractMaps(tree);
        setMaps(extracted);
        // 저장된 선택이 없으면 전체 선택, 있으면 저장값 사용
        if (selectedMaps.length === 0) {
          setChecked(new Set(extracted.map(m => m.address)));
        } else {
          setChecked(new Set(selectedMaps));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectRoot, selectedMaps]);

  const allChecked = maps.length > 0 && maps.every(m => checked.has(m.address));

  const toggle = (address: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  };

  const selectAll = () => setChecked(new Set(maps.map(m => m.address)));

  const handleConfirm = () => {
    onConfirm(Array.from(checked));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '20px 24px', width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#1f2328' }}>MAP 선택</p>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#8c959f' }}>표시할 MAP을 선택하세요 (복수 선택 가능)</p>

        {loading ? (
          <div style={{ fontSize: 13, color: '#8c959f', padding: '12px 0' }}>로딩 중...</div>
        ) : (
          <>
            {/* 전체 선택 버튼 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <button
                onClick={selectAll}
                disabled={allChecked}
                style={{
                  padding: '3px 10px', fontSize: 12, borderRadius: 4,
                  border: '1px solid #d0d7de', background: allChecked ? '#f6f8fa' : '#0969da',
                  color: allChecked ? '#8c959f' : '#fff', cursor: allChecked ? 'default' : 'pointer',
                }}
              >전체 선택</button>
              <span style={{ fontSize: 12, color: '#8c959f' }}>{checked.size} / {maps.length} 선택됨</span>
            </div>

            {/* MAP 목록 */}
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #d0d7de', borderRadius: 4 }}>
              {maps.map(m => (
                <label
                  key={m.address}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: `7px 10px 7px ${12 + m.depth * 16}px`,
                    borderBottom: '1px solid #d0d7de', cursor: 'pointer',
                    background: checked.has(m.address) ? '#f0f6ff' : 'transparent',
                    fontSize: 13, color: '#1f2328',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(m.address)}
                    onChange={() => toggle(m.address)}
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12, color: '#8c959f' }}>📁 {m.address}</span>
                  {m.summary && (
                    <span style={{ fontSize: 12, color: '#57606a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.summary}</span>
                  )}
                </label>
              ))}
            </div>

            {/* 확인 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={handleConfirm}
                disabled={checked.size === 0}
                style={{
                  padding: '5px 18px', fontSize: 13, fontWeight: 500, borderRadius: 4,
                  border: '1px solid #0969da', background: checked.size === 0 ? '#f6f8fa' : '#0969da',
                  color: checked.size === 0 ? '#8c959f' : '#fff', cursor: checked.size === 0 ? 'default' : 'pointer',
                }}
              >확인</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
