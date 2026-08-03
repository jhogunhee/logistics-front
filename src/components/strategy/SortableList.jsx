import { useState } from 'react';
import { GripVertical } from 'lucide-react';

/**
 * 순서 있는 목록의 drag & drop 래퍼 (HTML5 DnD — 의존성 없음).
 * 카드 안 입력 필드의 텍스트 선택과 충돌하지 않도록, 핸들(≡)을 누른 동안에만 draggable을 켠다.
 *
 * props:
 *   items       배열
 *   onReorder   (nextItems) => void
 *   renderItem  (item, idx, { handle }) => JSX — handle을 카드의 잡는 위치에 배치한다
 *   className   목록 컨테이너 클래스 (기본 세로 gap-3)
 */
export default function SortableList({ items, onReorder, renderItem, className = 'flex flex-col gap-3' }) {
    const [dragIdx, setDragIdx] = useState(null);
    const [armedIdx, setArmedIdx] = useState(null);   // 핸들을 누르고 있는 카드만 draggable
    const [overIdx, setOverIdx] = useState(null);

    const reset = () => {
        setDragIdx(null);
        setArmedIdx(null);
        setOverIdx(null);
    };

    const drop = (to) => {
        if (dragIdx == null || dragIdx === to) return;
        const next = [...items];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(to, 0, moved);
        onReorder(next);
    };

    return (
        <div className={className}>
            {items.map((item, idx) => (
                <div
                    key={idx}
                    draggable={armedIdx === idx}
                    onDragStart={() => setDragIdx(idx)}
                    onDragEnd={reset}
                    onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
                    onDrop={(e) => { e.preventDefault(); drop(idx); reset(); }}
                    className={overIdx === idx && dragIdx != null && dragIdx !== idx
                        ? 'ring-2 ring-indigo-300 rounded-xl'
                        : ''}
                >
                    {renderItem(item, idx, {
                        handle: (
                            <span
                                onMouseDown={() => setArmedIdx(idx)}
                                onMouseUp={() => setArmedIdx(null)}
                                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 shrink-0"
                                title="드래그로 순서 변경"
                            >
                                <GripVertical size={16} />
                            </span>
                        ),
                    })}
                </div>
            ))}
        </div>
    );
}
