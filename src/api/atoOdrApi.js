// 자동발주 API (산정·발행 — wms-backend 연동)
import api from '@/utils/axios';

export const atoOdrApi = {
    /** 발주 제안 산정. 저장되는 것은 없다 — 부를 때마다 그 시점의 재고로 다시 센다 */
    plan(cond = {}) {
        const params = Object.fromEntries(Object.entries(cond).filter(([, v]) => v));
        return api.get('/oms/ato-odr/plan', { params });
    },

    /** 발행 — 거래처 1곳이 입고주문(작성) 1건. 트랜잭션이 거래처 단위라 BatchResult로 돌아온다 */
    issue(requests) {
        return api.post('/oms/ato-odr', requests);
    },
};
