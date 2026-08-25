import { useState } from 'react';
import { Play, Rocket, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { outbWaveApi } from '@/api/outbWaveApi';
import { strategyApi } from '@/api/strategyApi';
import { num, todayStr } from '@/utils/format';
import DropdownSelect from '@/components/common/DropdownSelect';
import ConfirmModal from '@/components/common/ConfirmModal';
import DatePicker from '@/components/common/DatePicker';
import WaveOrderTrace from '@/components/strategy/WaveOrderTrace';

/**
 * 전략 편성 카드 — 조건에 맞는 미편성 주문을 전략별 웨이브로 자동 편성한다 (미리보기 · 실행).
 *
 * 전략은 조건(출고유형·차량편수)에 맞는 미편성 주문을 걸러 전략마다 웨이브를 하나 만들고,
 * 우선순위가 높은(=먼저 실행되는) 전략이 주문을 선점한다. 편입 0건인 전략은 웨이브를 만들지
 * 않으므로 재실행해도 빈 웨이브가 쌓이지 않는다.
 *
 * 실행 결과는 따로 그리지 않는다 — 전략별 생성/미생성과 주문별 판정 근거가 실행 로그에 그대로
 * 남으므로, 실행이 끝나면 호출부(onExecuted)가 실행 이력을 방금 건이 펼쳐진 채로 연다.
 *
 * @param strategies  웨이브 전략 목록 (우선순위 순)
 * @param onExecuted  실행 성공 후 (목록 재조회 · 실행 이력 열기)
 */
export default function WaveStrategyRunner({ strategies, onExecuted }) {
    const [execStgyId, setExecStgyId] = useState('');   // '' = 전 전략 자동실행
    const [execDe, setExecDe] = useState(todayStr());   // 대상 출고예정일 — 하루 단위 (웨이브 = 같은 날 주문 묶음)
    const [previewResult, setPreviewResult] = useState(null); // 미리보기 결과 (주문별 판정 근거)
    const [confirmExec, setConfirmExec] = useState(null);

    const execStgyNm = () => strategies.find(s => s.wavStgyId === Number(execStgyId))?.stgyNm;

    const requireExecDe = () => {
        if (!execDe) {
            toast('대상 출고예정일을 지정하세요 — 전략 실행은 하루 단위입니다.');
            return false;
        }
        return true;
    };

    const runPreview = async () => {
        if (!execStgyId) {
            // 전 전략 미리보기는 「먼저 실행된 전략이 선점」을 재현할 수 없어(전략마다 대상이 달라진다)
            // 실행 결과와 어긋난 그림을 보여주게 된다. 그래서 개별 전략에만 연다.
            toast('미리보기는 전략을 하나 골랐을 때만 가능합니다 — 전체 실행은 선점 순서가 결과를 바꿉니다.');
            return;
        }
        if (!requireExecDe()) return;
        try {
            setPreviewResult(await strategyApi.waveStrategies.previewSaved(Number(execStgyId), { expctDe: execDe }));
        } catch (e) {
            toast.error(e.message || '미리보기에 실패했습니다.');
        }
    };

    const doExec = async () => {
        try {
            const res = await outbWaveApi.stgyExec({
                wavStgyId: execStgyId ? Number(execStgyId) : null,
                expctDe: execDe,
            });
            setPreviewResult(null);
            const created = res.results.filter(r => r.wavId != null);
            if (created.length === 0) {
                toast(`대상 ${num(res.tgtCount)}건 중 편입 0건 — 만들어진 웨이브가 없습니다.`);
            } else {
                toast.success(`웨이브 ${created.length}개 생성 · 주문 ${num(res.assignedCount)}건 편성`);
            }
            await onExecuted();
        } catch (e) {
            toast.error(e.message || '전략 실행에 실패했습니다.');
        }
    };

    const stgyOptions = [
        { value: '', label: '전체 전략 (우선순위 순)' },
        ...strategies.map(s => ({ value: String(s.wavStgyId), label: `${s.prty}. ${s.stgyNm}` })),
    ];

    return (
        <>
            <div className="border border-slate-200 rounded-xl bg-white px-4 py-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <Rocket size={14} className="text-emerald-600" />
                        <span className="text-sm font-bold text-slate-700">전략 편성</span>
                    </div>
                    <div className="w-64">
                        <DropdownSelect
                            value={execStgyId}
                            onChange={(v) => { setExecStgyId(v); setPreviewResult(null); }}
                            options={stgyOptions}
                            placeholder="전략 선택"
                        />
                    </div>
                    {/* 하루 단위 (웨이브 = 같은 날 주문 묶음) */}
                    <label className="text-xs font-bold text-slate-500" title="웨이브는 같은 출고예정일 주문만 묶으므로 하루 단위로 실행합니다">대상 출고예정일</label>
                    <DatePicker value={execDe}
                                onChange={setExecDe}
                                className="w-36" />
                    <span className="text-[11px] text-slate-400">이 날짜 출고분의 미편성 주문이 대상</span>

                    <div className="ml-auto flex items-center gap-2">
                        <button onClick={runPreview} className="btn-ghost" title="DB를 바꾸지 않고 편입 여부만 판정합니다">
                            <Play size={13} /> 미리보기
                        </button>
                        <button onClick={() => { if (requireExecDe()) setConfirmExec(true); }} disabled={strategies.length === 0}
                                className="flex items-center gap-1 px-3 py-1.5 border border-emerald-200 rounded-lg text-[12px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300 disabled:border-slate-200">
                            <Rocket size={13} /> 전략 실행
                        </button>
                    </div>
                </div>

                {strategies.length === 0 && (
                    <span className="text-[11px] text-slate-400">
                        등록된 웨이브 전략이 없습니다 — 전략관리 화면에서 먼저 등록하거나, 아래에서 수동으로 편성하세요.
                    </span>
                )}
            </div>

            {/* 전략 실행 확인 */}
            {confirmExec && (
                <ConfirmModal
                    title="웨이브 전략을 실행할까요?"
                    confirmText="실행"
                    onCancel={() => setConfirmExec(null)}
                    onConfirm={() => { doExec(); setConfirmExec(null); }}
                >
                    <p className="text-sm text-slate-500">
                        {execStgyId ? <b>{execStgyNm()}</b> : <b>등록된 전략 전부</b>}를 <b>{execDe}</b> 출고분에 실행합니다.
                        {!execStgyId && ' 우선순위 순으로 돌며, 앞 전략이 가져간 주문은 뒤 전략의 후보에서 빠집니다.'}
                    </p>
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        조건에 맞는 미편성 주문이 새 웨이브로 편성됩니다 (실제 데이터가 바뀝니다).
                        편입 0건인 전략은 웨이브를 만들지 않으므로 다시 실행해도 빈 웨이브가 쌓이지 않습니다.
                    </p>
                </ConfirmModal>
            )}

            {/*
              * 미리보기 결과 — 주문별 판정 근거. "왜 이 주문이 안 걸렸나"에 조건 단위로 답한다.
              * 카드 안이 아니라 모달인 이유: 근거 목록은 대상 주문 수만큼 길어지는데, 카드가 커지면
              * 그 아래 그리드(웨이브·소속 주문)가 눌려 화면이 못 쓰게 된다.
              */}
            {previewResult && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/20"
                     onMouseDown={() => setPreviewResult(null)}>
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-[760px] max-h-[85vh] flex flex-col gap-4"
                         onMouseDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Play size={16} className="text-indigo-600" />
                                <h3 className="text-lg font-bold text-slate-800">미리보기 — {execStgyNm()}</h3>
                                <span className="text-xs text-slate-400">
                                    편입 {num(previewResult.matchedCount)} / 대상 {num(previewResult.tgtCount)} · DB 변경 없음
                                </span>
                            </div>
                            <button onClick={() => setPreviewResult(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
                            {previewResult.tgtCount === 0 && (
                                <p className="text-sm text-slate-400 text-center py-8">
                                    편성 대상 주문이 없습니다 — 미편성(신규) 주문만 대상입니다.
                                </p>
                            )}
                            {previewResult.orders.map((o, i) => <WaveOrderTrace key={i} order={o} />)}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
